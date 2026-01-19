import { BaseProvider } from "./base";
import type { ModelInfo, TokenCount } from "../types";
import { TokenCountError } from "../types";

interface GeminiModelResponse {
  models: Array<{
    name: string; // e.g., "models/gemini-2.5-pro"
    displayName: string;
    description?: string;
    supportedGenerationMethods: string[];
  }>;
}

interface CountTokensResponse {
  totalTokens: number;
}

// Best coding-focused Gemini models
const FEATURED_MODELS = [
  "gemini-3-pro",
  "gemini-3-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

export class GoogleProvider extends BaseProvider {
  readonly name = "google";

  private get apiKey(): string | undefined {
    return (
      this.config.apiKey ||
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY
    );
  }

  private get baseUrl(): string {
    return (
      this.config.baseUrl ||
      "https://generativelanguage.googleapis.com/v1beta"
    );
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async getModels(): Promise<ModelInfo[]> {
    if (this.cachedModels) {
      return this.cachedModels;
    }

    if (!this.isAvailable()) {
      // Return static list when API key is not available
      this.cachedModels = this.getStaticModels();
      return this.cachedModels;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as GeminiModelResponse;

      // Filter to only featured Gemini models (best for coding)
      const models: ModelInfo[] = data.models
        .filter(
          (m) =>
            m.name.startsWith("models/gemini-") &&
            m.supportedGenerationMethods.includes("generateContent")
        )
        .map((m) => {
          const id = m.name.replace("models/", "");
          return {
            id,
            displayName: m.displayName,
            aliases: this.generateAliases(id),
          };
        })
        .filter((m) => this.isFeaturedModel(m.id))
        .sort((a, b) => a.id.localeCompare(b.id));

      this.cachedModels = models;
      return models;
    } catch (error) {
      console.error("Failed to fetch Google models:", error);
      return [];
    }
  }

  /** Generate convenient aliases for a model ID */
  private generateAliases(modelId: string): string[] {
    const aliases: string[] = [];

    // gemini-2.5-pro -> 2.5-pro, gemini-pro
    const match = modelId.match(/^gemini-(\d+\.?\d*)-(\w+)(?:-(.+))?$/);
    if (match) {
      const [, version, variant, suffix] = match;
      // Version-variant alias (e.g., "2.5-pro", "2.5-flash")
      aliases.push(`${version}-${variant}`);

      // Short variant alias for latest version (e.g., "pro", "flash")
      if (version === "2.5" || version === "3") {
        aliases.push(variant);
      }

      // Full without date suffix
      if (suffix && /^\d{3,}$/.test(suffix)) {
        aliases.push(`gemini-${version}-${variant}`);
      }
    }

    return aliases;
  }

  async countTokens(text: string, modelId: string): Promise<TokenCount> {
    if (!this.isAvailable()) {
      throw new TokenCountError(
        "GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required for Google models",
        "MISSING_API_KEY"
      );
    }

    const model = await this.findModel(modelId);
    if (!model) {
      throw new TokenCountError(
        `Unknown Google model: ${modelId}`,
        "INVALID_MODEL"
      );
    }

    const tokens = await this.countTokensRaw(text, model.id);
    const displayName = this.getShortDisplayName(model.id);
    const featured = this.isFeaturedModel(model.id);
    return this.createResult(
      model.id,
      tokens,
      "generativelanguage.googleapis.com",
      modelId,
      displayName,
      featured
    );
  }

  /**
   * Count tokens for all models at once.
   * Gemini models may use different tokenizers, so we group by base model family.
   */
  async countTokensAllModels(text: string): Promise<TokenCount[]> {
    if (!this.isAvailable()) {
      throw new TokenCountError(
        "GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required for Google models",
        "MISSING_API_KEY"
      );
    }

    const models = await this.getModels();
    if (models.length === 0) {
      return [];
    }

    // Group models by their tokenizer family
    // Gemini 2.x models likely share the same tokenizer
    // Gemini 1.x models share a different tokenizer
    const tokenizerGroups = new Map<string, ModelInfo[]>();

    for (const model of models) {
      const family = this.getTokenizerFamily(model.id);
      const group = tokenizerGroups.get(family) || [];
      group.push(model);
      tokenizerGroups.set(family, group);
    }

    const results: TokenCount[] = [];

    // Count tokens once per tokenizer family
    for (const [, groupModels] of tokenizerGroups) {
      // Use the first model in the group for counting
      const representativeModel = groupModels[0];
      const tokens = await this.countTokensRaw(text, representativeModel.id);

      // Apply same count to all models in the family
      for (const model of groupModels) {
        const displayName = this.getShortDisplayName(model.id);
        const featured = this.isFeaturedModel(model.id);
        results.push(
          this.createResult(
            model.id,
            tokens,
            "generativelanguage.googleapis.com",
            model.id,
            displayName,
            featured
          )
        );
      }
    }

    return results;
  }

  /** Get tokenizer family for a model (models in same family share tokenizer) */
  private getTokenizerFamily(modelId: string): string {
    // Gemini 3.x family
    if (modelId.startsWith("gemini-3")) return "gemini-3";
    // Gemini 2.5 family
    if (modelId.startsWith("gemini-2.5")) return "gemini-2.5";
    // Gemini 2.0 family
    if (modelId.startsWith("gemini-2.0")) return "gemini-2.0";
    // Gemini 1.5 family
    if (modelId.startsWith("gemini-1.5")) return "gemini-1.5";
    // Default: each model is its own family
    return modelId;
  }

  /** Check if a model is featured (latest recommended models for coding) */
  private isFeaturedModel(modelId: string): boolean {
    return FEATURED_MODELS.some(
      (featured) =>
        modelId === featured || modelId.startsWith(`${featured}-`)
    );
  }

  /** Get short display name for output table */
  private getShortDisplayName(modelId: string): string {
    // Remove date suffixes like -001, -002, -20250506
    return modelId.replace(/-\d{3,}$/, "");
  }

  /** Raw token counting - makes the API call */
  private async countTokensRaw(
    text: string,
    modelId: string
  ): Promise<number> {
    const response = await fetch(
      `${this.baseUrl}/models/${modelId}:countTokens?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new TokenCountError(`Google API error: ${error}`, "API_ERROR");
    }

    const data = (await response.json()) as CountTokensResponse;
    return data.totalTokens;
  }

  /** Static list of featured models (used when API key is not available) */
  private getStaticModels(): ModelInfo[] {
    return [
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", aliases: ["2.5-pro", "pro"] },
      { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", aliases: ["2.5-flash", "flash"] },
    ];
  }
}
