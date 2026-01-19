import type { TokenProvider, ModelInfo } from "./types";

class ProviderRegistry {
  private providers = new Map<string, TokenProvider>();

  /** Register a provider instance */
  register(provider: TokenProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Get a specific provider by name */
  get(name: string): TokenProvider | undefined {
    return this.providers.get(name);
  }

  /** Get all registered providers */
  all(): TokenProvider[] {
    return Array.from(this.providers.values());
  }

  /** Get all available providers (have required config) */
  available(): TokenProvider[] {
    return this.all().filter((p) => p.isAvailable());
  }

  /** Get all unavailable providers (missing config) */
  unavailable(): TokenProvider[] {
    return this.all().filter((p) => !p.isAvailable());
  }

  /** Find provider that supports a given model */
  async findProviderForModel(modelId: string): Promise<TokenProvider | undefined> {
    for (const provider of this.all()) {
      if (await provider.supportsModel(modelId)) {
        return provider;
      }
    }
    return undefined;
  }

  /** Get all models from all available providers */
  async allModels(): Promise<Array<ModelInfo & { provider: string }>> {
    const results: Array<ModelInfo & { provider: string }>[] = await Promise.all(
      this.available().map(async (p) => {
        const models = await p.getModels();
        return models.map((m) => ({ ...m, provider: p.name }));
      })
    );
    return results.flat();
  }
}

// Singleton instance
export const registry = new ProviderRegistry();

// Helper function for provider registration
export function registerProvider(provider: TokenProvider): void {
  registry.register(provider);
}
