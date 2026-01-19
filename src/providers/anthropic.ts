import { BaseProvider } from "./base";
import type { ModelInfo, TokenCount } from "../types";
import { TokenCountError } from "../types";

interface AnthropicModelResponse {
  data: Array<{
    id: string;
    display_name: string;
    created_at: string;
    type: "model";
  }>;
  has_more: boolean;
  first_id: string;
  last_id: string;
}

export class AnthropicProvider extends BaseProvider {
  readonly name = "anthropic";

  private get apiKey(): string | undefined {
    return this.config.apiKey || process.env.ANTHROPIC_API_KEY;
  }

  private get baseUrl(): string {
    return this.config.baseUrl || "https://api.anthropic.com";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async getModels(): Promise<ModelInfo[]> {
    // Return cached models if available
    if (this.cachedModels) {
      return this.cachedModels;
    }

    if (!this.isAvailable()) {
      // Return empty array if no API key - can't fetch models
      return [];
    }

    try {
      const allModels: ModelInfo[] = [];
      let afterId: string | undefined;

      // Paginate through all models
      do {
        const url = new URL(`${this.baseUrl}/v1/models`);
        url.searchParams.set("limit", "1000");
        if (afterId) {
          url.searchParams.set("after_id", afterId);
        }

        const response = await fetch(url.toString(), {
          headers: {
            "x-api-key": this.apiKey!,
            "anthropic-version": "2023-06-01",
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.statusText}`);
        }

        const data = (await response.json()) as AnthropicModelResponse;

        for (const model of data.data) {
          allModels.push({
            id: model.id,
            displayName: model.display_name,
            aliases: this.generateAliases(model.id),
          });
        }

        afterId = data.has_more ? data.last_id : undefined;
      } while (afterId);

      // Filter to only featured models (best for coding)
      const models = allModels.filter((m) => this.isFeaturedModel(m.id));

      this.cachedModels = models;
      return models;
    } catch (error) {
      // If fetching fails, return empty array
      console.error("Failed to fetch Anthropic models:", error);
      return [];
    }
  }

  /** Generate convenient aliases for a model ID */
  private generateAliases(modelId: string): string[] {
    const aliases: string[] = [];

    // Extract model family and version from ID
    // e.g., "claude-sonnet-4-5-20250929" -> "sonnet", "sonnet-4.5", "claude-sonnet-4-5"
    const match = modelId.match(
      /^claude-(\w+)-(\d+)(?:-(\d+))?-(\d{8})$/
    );

    if (match) {
      const [, family, majorVersion, minorVersion] = match;
      const version = minorVersion
        ? `${majorVersion}.${minorVersion}`
        : majorVersion;

      // Add alias without date suffix
      aliases.push(`claude-${family}-${majorVersion}${minorVersion ? `-${minorVersion}` : ""}`);

      // Add family-version alias (e.g., "sonnet-4.5")
      aliases.push(`${family}-${version}`);

      // The first model of each family gets the short alias (determined by the CLI when listing)
    }

    return aliases;
  }

  async countTokens(text: string, modelId: string): Promise<TokenCount> {
    if (!this.isAvailable()) {
      throw new TokenCountError(
        "ANTHROPIC_API_KEY environment variable is required for Anthropic models",
        "MISSING_API_KEY"
      );
    }

    const model = await this.findModel(modelId);
    if (!model) {
      throw new TokenCountError(
        `Unknown Anthropic model: ${modelId}`,
        "INVALID_MODEL"
      );
    }

    const tokens = await this.countTokensRaw(text, model.id);
    const displayName = this.getDisplayName(model.id);
    const featured = this.isFeaturedModel(model.id);
    return this.createResult(model.id, tokens, "api.anthropic.com", modelId, displayName, featured);
  }

  /**
   * Count tokens for all models at once.
   * All Anthropic models use the same tokenizer, so we only need one API call.
   */
  async countTokensAllModels(text: string): Promise<TokenCount[]> {
    if (!this.isAvailable()) {
      throw new TokenCountError(
        "ANTHROPIC_API_KEY environment variable is required for Anthropic models",
        "MISSING_API_KEY"
      );
    }

    const models = await this.getModels();
    if (models.length === 0) {
      return [];
    }

    // All Anthropic models use the same tokenizer, so count once with any model
    const tokens = await this.countTokensRaw(text, models[0].id);

    // Return the same token count for all models
    return models.map((model) => {
      const displayName = this.getDisplayName(model.id);
      const featured = this.isFeaturedModel(model.id);
      return this.createResult(model.id, tokens, "api.anthropic.com", model.id, displayName, featured);
    });
  }

  /** Check if a model is featured (best for coding) */
  private isFeaturedModel(modelId: string): boolean {
    // Featured models from opencode.ai pricing:
    // - Claude Sonnet 4.5, Sonnet 4
    // - Claude Haiku 4.5, Haiku 3.5
    // - Claude Opus 4.5, Opus 4.1
    return (
      modelId.includes("sonnet-4-5") ||
      modelId.includes("sonnet-4-0") ||
      modelId.includes("sonnet-4-2") || // dated versions
      modelId.includes("haiku-4-5") ||
      modelId.includes("3-5-haiku") ||
      modelId.includes("opus-4-5") ||
      modelId.includes("opus-4-1")
    );
  }

  /** Get human-friendly display name for a model */
  private getDisplayName(modelId: string): string {
    // Map model IDs to friendly names
    if (modelId.includes("sonnet-4-5")) return "Claude Sonnet 4.5";
    if (modelId.includes("sonnet-4")) return "Claude Sonnet 4";
    if (modelId.includes("haiku-4-5")) return "Claude Haiku 4.5";
    if (modelId.includes("3-5-haiku")) return "Claude Haiku 3.5";
    if (modelId.includes("opus-4-5")) return "Claude Opus 4.5";
    if (modelId.includes("opus-4-1")) return "Claude Opus 4.1";
    if (modelId.includes("opus-4")) return "Claude Opus 4";
    // Fallback: clean up the model ID
    return modelId.replace(/-\d{8}$/, "");
  }

  /** Raw token counting - makes the API call */
  private async countTokensRaw(text: string, modelId: string): Promise<number> {
    const response = await fetch(`${this.baseUrl}/v1/messages/count_tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new TokenCountError(`Anthropic API error: ${error}`, "API_ERROR");
    }

    const data = (await response.json()) as { input_tokens: number };
    return data.input_tokens;
  }
}
