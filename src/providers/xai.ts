import { BaseProvider } from "./base";
import type { ModelInfo, TokenCount } from "../types";
import { TokenCountError } from "../types";
import { encoding_for_model, type TiktokenModel } from "tiktoken";

// xAI Grok models
const MODELS: ModelInfo[] = [
  { id: "grok-code-fast-1", displayName: "Grok Code Fast 1", aliases: ["grok", "grok-code"] },
];

export class XAIProvider extends BaseProvider {
  readonly name = "xai";

  isAvailable(): boolean {
    // Always available - uses tiktoken locally (no official token counting API)
    return true;
  }

  async getModels(): Promise<ModelInfo[]> {
    if (this.cachedModels) return this.cachedModels;
    this.cachedModels = MODELS;
    return MODELS;
  }

  async countTokens(text: string, modelId: string): Promise<TokenCount> {
    const model = await this.findModel(modelId);
    if (!model) {
      throw new TokenCountError(`Unknown xAI model: ${modelId}`, "INVALID_MODEL");
    }

    const tokens = this.countWithTiktoken(text);
    return this.createResult(model.id, tokens, "tiktoken", modelId, model.displayName, true);
  }

  async countTokensAllModels(text: string): Promise<TokenCount[]> {
    const models = await this.getModels();
    const tokens = this.countWithTiktoken(text);

    return models.map((model) =>
      this.createResult(model.id, tokens, "tiktoken", model.id, model.displayName, true)
    );
  }

  private countWithTiktoken(text: string): number {
    // Use o200k_base encoding (gpt-4o) as approximation for Grok
    const encoder = encoding_for_model("gpt-4o" as TiktokenModel);
    const tokens = encoder.encode(text).length;
    encoder.free();
    return tokens;
  }
}
