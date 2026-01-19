import type {
  TokenProvider,
  ModelInfo,
  TokenCount,
  ProviderConfig,
} from "../types";

export abstract class BaseProvider implements TokenProvider {
  abstract readonly name: string;

  protected config: ProviderConfig;
  protected cachedModels: ModelInfo[] | null = null;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
  }

  abstract isAvailable(): boolean;
  abstract getModels(): Promise<ModelInfo[]>;
  abstract countTokens(text: string, modelId: string): Promise<TokenCount>;

  /** 
   * Count tokens for all models at once (optimized).
   * Default implementation calls countTokens for each model.
   * Providers can override this to avoid redundant API calls.
   */
  async countTokensAllModels(text: string): Promise<TokenCount[]> {
    const models = await this.getModels();
    const results: TokenCount[] = [];
    for (const model of models) {
      results.push(await this.countTokens(text, model.id));
    }
    return results;
  }

  /** Check if this provider supports a model by ID or alias */
  async supportsModel(modelId: string): Promise<boolean> {
    const models = await this.getModels();
    const normalized = modelId.toLowerCase();
    return models.some(
      (m) =>
        m.id.toLowerCase() === normalized ||
        m.aliases?.some((a) => a.toLowerCase() === normalized)
    );
  }

  /** Helper to find model info by ID or alias */
  protected async findModel(modelId: string): Promise<ModelInfo | undefined> {
    const models = await this.getModels();
    const normalized = modelId.toLowerCase();
    return models.find(
      (m) =>
        m.id.toLowerCase() === normalized ||
        m.aliases?.some((a) => a.toLowerCase() === normalized)
    );
  }

  /** Helper to create a TokenCount result */
  protected createResult(
    model: string,
    tokens: number,
    source: string,
    requestedAs?: string,
    displayName?: string,
    featured?: boolean
  ): TokenCount {
    return {
      provider: this.name,
      model,
      tokens,
      source,
      ...(displayName && { displayName }),
      ...(requestedAs && requestedAs !== model && { requestedAs }),
      ...(featured && { featured }),
    };
  }
}
