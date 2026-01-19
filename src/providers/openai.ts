import { BaseProvider } from "./base";
import type { ModelInfo, TokenCount } from "../types";
import { TokenCountError } from "../types";
import { encoding_for_model, type TiktokenModel } from "tiktoken";

interface OpenAIModelResponse {
  object: "list";
  data: Array<{
    id: string;
    object: "model";
    created: number;
    owned_by: string;
  }>;
}

// Tiktoken encoding mapping for OpenAI models
// All recent models use o200k_base encoding (same as gpt-4o)
const TIKTOKEN_ENCODINGS: Record<string, TiktokenModel> = {
  // GPT-5.2 series
  "gpt-5.2": "gpt-4o",
  "gpt-5.2-codex": "gpt-4o",
  // GPT-5.1 series
  "gpt-5.1": "gpt-4o",
  "gpt-5.1-codex": "gpt-4o",
  "gpt-5.1-codex-max": "gpt-4o",
  "gpt-5.1-codex-mini": "gpt-4o",
  // GPT-5 series
  "gpt-5": "gpt-4o",
  "gpt-5-codex": "gpt-4o",
  "gpt-5-nano": "gpt-4o",
};

export class OpenAIProvider extends BaseProvider {
  readonly name = "openai";

  private get apiKey(): string | undefined {
    return this.config.apiKey || process.env.OPENAI_API_KEY;
  }

  private get baseUrl(): string {
    return this.config.baseUrl || "https://api.openai.com";
  }

  isAvailable(): boolean {
    // Available if API key is set (for fetching models) OR always for tiktoken
    // We return true because tiktoken works offline
    return true;
  }

  async getModels(): Promise<ModelInfo[]> {
    // Return cached models if available
    if (this.cachedModels) {
      return this.cachedModels;
    }

    // If API key available, fetch from API
    if (this.apiKey) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/models`, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        });

        if (response.ok) {
          const data = (await response.json()) as OpenAIModelResponse;

          // Filter to only models that tiktoken supports
          const models: ModelInfo[] = data.data
            .filter((m) => this.getTiktokenModel(m.id) !== undefined)
            .map((m) => ({
              id: m.id,
              displayName: this.formatDisplayName(m.id),
              aliases: this.generateAliases(m.id),
            }))
            // Sort by model name for consistent ordering
            .sort((a, b) => a.id.localeCompare(b.id));

          this.cachedModels = models;
          return models;
        }
      } catch (error) {
        // Fall through to static list
      }
    }

    // Fallback to static list of common models
    this.cachedModels = this.getStaticModels();
    return this.cachedModels;
  }

  /** Get static list of featured models (best for coding) */
  private getStaticModels(): ModelInfo[] {
    return [
      // GPT-5.2 series
      { id: "gpt-5.2", displayName: "GPT 5.2", aliases: ["5.2"] },
      { id: "gpt-5.2-codex", displayName: "GPT 5.2 Codex", aliases: ["5.2-codex"] },
      // GPT-5.1 series
      { id: "gpt-5.1", displayName: "GPT 5.1", aliases: ["5.1"] },
      { id: "gpt-5.1-codex", displayName: "GPT 5.1 Codex", aliases: ["5.1-codex"] },
      { id: "gpt-5.1-codex-max", displayName: "GPT 5.1 Codex Max", aliases: ["5.1-codex-max"] },
      { id: "gpt-5.1-codex-mini", displayName: "GPT 5.1 Codex Mini", aliases: ["5.1-codex-mini"] },
      // GPT-5 series
      { id: "gpt-5", displayName: "GPT 5", aliases: ["5"] },
      { id: "gpt-5-codex", displayName: "GPT 5 Codex", aliases: ["5-codex", "codex"] },
      { id: "gpt-5-nano", displayName: "GPT 5 Nano", aliases: ["5-nano", "nano"] },
    ];
  }

  /** Format model ID into display name */
  private formatDisplayName(modelId: string): string {
    return modelId
      .replace(/^gpt-/, "GPT-")
      .replace(/-(\d)/g, " $1")
      .replace(/(\d)-/g, "$1 ")
      .replace(/turbo/gi, "Turbo")
      .replace(/mini/gi, "Mini")
      .replace(/preview/gi, "Preview");
  }

  /** Generate aliases for a model ID */
  private generateAliases(modelId: string): string[] {
    const aliases: string[] = [];

    // GPT-5.x aliases
    if (modelId === "gpt-5.2") aliases.push("5.2");
    if (modelId === "gpt-5.2-pro") aliases.push("5.2-pro");
    if (modelId === "gpt-5.2-codex") aliases.push("5.2-codex", "codex");
    if (modelId === "gpt-5.1") aliases.push("5.1");
    if (modelId === "gpt-5.1-codex") aliases.push("5.1-codex");
    if (modelId === "gpt-5-mini") aliases.push("5-mini");
    if (modelId === "gpt-5-nano") aliases.push("5-nano");
    // GPT-4.x aliases
    if (modelId === "gpt-4.1") aliases.push("4.1");
    if (modelId === "gpt-4.1-mini") aliases.push("4.1-mini");
    if (modelId === "gpt-4.1-nano") aliases.push("4.1-nano");
    // GPT-4o aliases
    if (modelId === "gpt-4o") aliases.push("4o");
    if (modelId === "gpt-4o-mini") aliases.push("4o-mini");

    return aliases;
  }

  /** Get tiktoken model for a given model ID */
  private getTiktokenModel(modelId: string): TiktokenModel | undefined {
    // Direct match
    if (TIKTOKEN_ENCODINGS[modelId]) {
      return TIKTOKEN_ENCODINGS[modelId];
    }

    // Try to match base model (e.g., "gpt-4o-2024-05-13" -> "gpt-4o")
    for (const [key, value] of Object.entries(TIKTOKEN_ENCODINGS)) {
      if (modelId.startsWith(key)) {
        return value;
      }
    }

    return undefined;
  }

  async countTokens(text: string, modelId: string): Promise<TokenCount> {
    const model = await this.findModel(modelId);
    if (!model) {
      throw new TokenCountError(
        `Unknown OpenAI model: ${modelId}`,
        "INVALID_MODEL"
      );
    }

    const tiktokenModel = this.getTiktokenModel(model.id);
    if (!tiktokenModel) {
      throw new TokenCountError(
        `No tiktoken encoding for model: ${model.id}`,
        "INVALID_MODEL"
      );
    }

    const tokens = this.countTokensWithTiktoken(text, tiktokenModel);
    const featured = this.isFeaturedModel(model.id);
    return this.createResult(model.id, tokens, "tiktoken", modelId, model.displayName, featured);
  }

  /**
   * Count tokens for all models at once.
   * Different model families use different encodings, so we count once per encoding.
   */
  async countTokensAllModels(text: string): Promise<TokenCount[]> {
    const models = await this.getModels();
    if (models.length === 0) {
      return [];
    }

    // Group models by their tiktoken encoding
    const encodingGroups = new Map<TiktokenModel, ModelInfo[]>();
    for (const model of models) {
      const tiktokenModel = this.getTiktokenModel(model.id);
      if (tiktokenModel) {
        const group = encodingGroups.get(tiktokenModel) || [];
        group.push(model);
        encodingGroups.set(tiktokenModel, group);
      }
    }

    // Count tokens once per encoding
    const results: TokenCount[] = [];
    for (const [tiktokenModel, groupModels] of encodingGroups) {
      const tokens = this.countTokensWithTiktoken(text, tiktokenModel);
      
      // Create result for each model in this encoding group
      for (const model of groupModels) {
        const featured = this.isFeaturedModel(model.id);
        results.push(this.createResult(model.id, tokens, "tiktoken", model.id, model.displayName, featured));
      }
    }

    return results;
  }

  /** Check if a model is featured (best for coding) */
  private isFeaturedModel(modelId: string): boolean {
    // All GPT-5.x models are featured for coding
    return modelId.startsWith("gpt-5");
  }

  /** Count tokens using tiktoken */
  private countTokensWithTiktoken(text: string, tiktokenModel: TiktokenModel): number {
    const encoder = encoding_for_model(tiktokenModel);
    const tokens = encoder.encode(text).length;
    encoder.free(); // Clean up WASM resources
    return tokens;
  }
}
