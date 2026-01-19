import { BaseProvider } from "./base";
import type { ModelInfo, TokenCount } from "../types";
import { TokenCountError } from "../types";

// Zhipu GLM models
const MODELS: ModelInfo[] = [
  { id: "glm-4.7", displayName: "GLM 4.7", aliases: ["glm", "glm-4"] },
  { id: "glm-4.6", displayName: "GLM 4.6", aliases: [] },
];

interface ZhipuTokenResponse {
  id: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class ZhipuProvider extends BaseProvider {
  readonly name = "zhipu";

  private get apiKey(): string | undefined {
    return this.config.apiKey || process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY;
  }

  private get baseUrl(): string {
    return this.config.baseUrl || "https://api.z.ai";
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
        "ZHIPU_API_KEY environment variable is required for GLM models",
        "MISSING_API_KEY"
      );
    }

    const model = await this.findModel(modelId);
    if (!model) {
      throw new TokenCountError(`Unknown Zhipu model: ${modelId}`, "INVALID_MODEL");
    }

    const tokens = await this.countTokensWithApi(text, model.id);
    return this.createResult(model.id, tokens, "api.z.ai", modelId, model.displayName, true);
  }

  async countTokensAllModels(text: string): Promise<TokenCount[]> {
    if (!this.isAvailable()) {
      throw new TokenCountError(
        "ZHIPU_API_KEY environment variable is required for GLM models",
        "MISSING_API_KEY"
      );
    }

    const models = await this.getModels();
    // GLM models use the same tokenizer, count once
    const tokens = await this.countTokensWithApi(text, models[0].id);
    return models.map((model) =>
      this.createResult(model.id, tokens, "api.z.ai", model.id, model.displayName, true)
    );
  }

  /** Count tokens using Zhipu's official API */
  private async countTokensWithApi(text: string, modelId: string): Promise<number> {
    const response = await fetch(`${this.baseUrl}/api/paas/v4/tokenizer`, {
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
      throw new TokenCountError(`Zhipu API error: ${error}`, "API_ERROR");
    }

    const data = (await response.json()) as ZhipuTokenResponse;
    return data.usage.prompt_tokens;
  }

}
