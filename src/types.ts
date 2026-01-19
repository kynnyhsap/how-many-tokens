/** Result of counting tokens for a single model */
export interface TokenCount {
  provider: string;
  /** Full model ID */
  model: string;
  /** Short display name for the model (first alias or simplified name) */
  displayName?: string;
  /** Alias used to request this model (if different from model ID) */
  requestedAs?: string;
  tokens: number;
  /** Source of the token count (e.g., "tiktoken", "api.anthropic.com") */
  source: string;
  /** Whether this is a featured/recommended model */
  featured?: boolean;
  /** Whether this result was skipped (e.g., missing API key) */
  skipped?: boolean;
  /** Reason for skipping */
  skipReason?: string;
}

/** Provider capability metadata */
export interface ModelInfo {
  /** Full model ID (e.g., "claude-3-5-sonnet-20241022") */
  id: string;
  /** Human-friendly name (e.g., "Claude 3.5 Sonnet") */
  displayName: string;
  /** Short aliases (e.g., ["sonnet", "claude-sonnet"]) */
  aliases?: string[];
}

/** Configuration passed to providers */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

/** Main provider interface */
export interface TokenProvider {
  /** Unique provider identifier */
  readonly name: string;

  /** Check if provider is available (has required config) */
  isAvailable(): boolean;

  /** Get list of supported models (may fetch from API) */
  getModels(): Promise<ModelInfo[]>;

  /** Count tokens for given text and model */
  countTokens(text: string, modelId: string): Promise<TokenCount>;

  /** 
   * Count tokens for all models at once (optimized).
   * Providers can override this to avoid redundant API calls.
   */
  countTokensAllModels(text: string): Promise<TokenCount[]>;

  /** Check if this provider handles a given model ID */
  supportsModel(modelId: string): Promise<boolean>;
}

/** CLI options after parsing */
export interface CLIOptions {
  text?: string;
  file?: string;
  model?: string;
  output: "table" | "json" | "simple";
  verbose?: boolean;
}

/** Custom error class with error codes */
export class TokenCountError extends Error {
  constructor(
    message: string,
    public code:
      | "MISSING_API_KEY"
      | "INVALID_MODEL"
      | "API_ERROR"
      | "FILE_NOT_FOUND"
      | "NO_INPUT"
  ) {
    super(message);
    this.name = "TokenCountError";
  }
}
