import { BaseProvider } from "./base";
import type { ModelInfo, TokenCount } from "../types";
import { TokenCountError } from "../types";

// Moonshot Kimi models
const MODELS: ModelInfo[] = [
  { id: "kimi-k2-0905-preview", displayName: "Kimi K2", aliases: ["kimi", "k2", "kimi-k2"] },
  { id: "kimi-k2-thinking", displayName: "Kimi K2 Thinking", aliases: ["k2-thinking", "kimi-thinking"] },
];

interface MoonshotTokenResponse {
  data: {
    total_tokens: number;
  };
}

export class MoonshotProvider extends BaseProvider {
  readonly name = "moonshot";

  private get apiKey(): string | undefined {
    return this.config.apiKey || process.env.MOONSHOT_API_KEY;
  }

  private get baseUrl(): string {
    return this.config.baseUrl || "https://api.moonshot.ai";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async getModels(): Promise<ModelInfo[]> {
    if (this.cachedModels) return this.cachedModels;
    this.cachedModels = MODELS;
    return MODELS;
  }

  async countTokens(text: string, modelId: string): Promise<TokenCount> {
    if (!this.isAvailable()) {
      throw new TokenCountError(
        "MOONSHOT_API_KEY environment variable is required for Kimi models",
        "MISSING_API_KEY"
      );
    }

    const model = await this.findModel(modelId);
    if (!model) {
      throw new TokenCountError(`Unknown Moonshot model: ${modelId}`, "INVALID_MODEL");
    }

    const tokens = await this.countTokensWithApi(text, model.id);
    return this.createResult(model.id, tokens, "api.moonshot.ai", modelId, model.displayName, true);
  }

  async countTokensAllModels(text: string): Promise<TokenCount[]> {
    if (!this.isAvailable()) {
      throw new TokenCountError(
        "MOONSHOT_API_KEY environment variable is required for Kimi models",
        "MISSING_API_KEY"
      );
    }

    const models = await this.getModels();
    // All Kimi models use the same tokenizer, count once
    const tokens = await this.countTokensWithApi(text, models[0].id);
    return models.map((model) =>
      this.createResult(model.id, tokens, "api.moonshot.ai", model.id, model.displayName, true)
    );
  }

  /** Count tokens using Moonshot's official API */
  private async countTokensWithApi(text: string, modelId: string): Promise<number> {
    const response = await fetch(`${this.baseUrl}/v1/tokenizers/estimate-token-count`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new TokenCountError(`Moonshot API error: ${error}`, "API_ERROR");
    }

    const data = (await response.json()) as MoonshotTokenResponse;
    return data.data.total_tokens;
  }

}
