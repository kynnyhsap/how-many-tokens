import { Command } from "commander";
import pc from "picocolors";
import { registry } from "./providers";
import { getInput } from "./input";
import { formatOutput, type OutputFormat } from "./output";
import type { TokenCount } from "./types";
import { TokenCountError } from "./types";

/** Clear the current line and move cursor to start */
function clearLine(): void {
  process.stdout.write("\r\x1b[K");
}

/** Log a status message that will be cleared */
function logStatus(message: string): void {
  clearLine();
  process.stdout.write(message);
}

/** Log a final message with newline */
function logDone(message: string): void {
  clearLine();
  console.log(message);
}

/** Print custom colored help */
function printHelp(): void {
  console.log(`
${pc.bold(pc.cyan("how-many-tokens"))} ${pc.dim("- Count tokens across LLM providers")}

${pc.bold("USAGE")}
  ${pc.green("$")} ${pc.cyan("hmt")} ${pc.yellow("<text>")}
  ${pc.green("$")} ${pc.cyan("hmt")} ${pc.yellow("-f <file>")}
  ${pc.green("$")} ${pc.dim("echo \"text\" |")} ${pc.cyan("hmt")}

${pc.bold("ARGUMENTS")}
  ${pc.yellow("<text>")}              Text to count tokens for

${pc.bold("OPTIONS")}
  ${pc.green("-f, --file")} ${pc.yellow("<path>")}   Read input from file
  ${pc.green("-m, --model")} ${pc.yellow("<id>")}    Count for specific model only
  ${pc.green("-o, --output")} ${pc.yellow("<fmt>")}  Output format: ${pc.dim("table")}, json, simple
  ${pc.green("--list-models")}        List all supported models
  ${pc.green("-v, --verbose")}        Show errors and debug info
  ${pc.green("-h, --help")}           Show this help
  ${pc.green("-V, --version")}        Show version

${pc.bold("EXAMPLES")}
  ${pc.dim("# Count tokens for inline text")}
  ${pc.green("$")} hmt "Hello, world!"

  ${pc.dim("# Count tokens from a file")}
  ${pc.green("$")} hmt -f src/index.ts

  ${pc.dim("# Pipe from stdin")}
  ${pc.green("$")} cat README.md | hmt

  ${pc.dim("# Count for a specific model")}
  ${pc.green("$")} hmt "Hello" -m sonnet-4.5

  ${pc.dim("# Output as JSON")}
  ${pc.green("$")} hmt "Hello" -o json

${pc.bold("ENVIRONMENT")}
  ${pc.cyan("ANTHROPIC_API_KEY")}    Claude models ${pc.dim("(required)")}
  ${pc.cyan("GOOGLE_API_KEY")}       Gemini models ${pc.dim("(required)")}
  ${pc.cyan("MOONSHOT_API_KEY")}     Kimi models ${pc.dim("(required)")}
  ${pc.cyan("ZHIPU_API_KEY")}        GLM models ${pc.dim("(required)")}

${pc.bold("OFFLINE PROVIDERS")} ${pc.dim("(no API key needed)")}
  OpenAI, xAI, Alibaba, MiniMax ${pc.dim("- use tiktoken locally")}
`);
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = new Command()
    .name("how-many-tokens")
    .description("Count tokens for text across different LLM providers")
    .version("1.0.0")
    .argument("[text]", "Text to count tokens for")
    .option("-f, --file <path>", "Read input from file")
    .option("-m, --model <id>", "Specific model to use (default: all available)")
    .option(
      "-o, --output <format>",
      "Output format: table, json, simple",
      "table"
    )
    .option("-v, --verbose", "Show verbose output including errors")
    .option("--list-models", "List all supported models")
    .helpOption(false) // Disable default help
    .option("-h, --help", "Show help")
    .action(async (text, options) => {
      // Show help if -h/--help or no input provided
      if (options.help) {
        printHelp();
        return;
      }
      
      try {
        await execute(text, options);
      } catch (err) {
        handleError(err, options.verbose);
      }
    });

  // Check if no meaningful args provided (only node and script path)
  const userArgs = argv.slice(2);
  if (userArgs.length === 0) {
    printHelp();
    return;
  }

  await program.parseAsync(argv);
}

async function execute(
  text: string | undefined,
  options: {
    file?: string;
    model?: string;
    output: string;
    verbose?: boolean;
    listModels?: boolean;
  }
): Promise<void> {
  // Handle --list-models
  if (options.listModels) {
    logStatus(pc.dim("Fetching available models..."));
    const models = await registry.allModels();
    logDone(pc.green("Supported models:") + "\n");
    
    let currentProvider = "";
    for (const model of models) {
      // Print provider header when it changes
      if (model.provider !== currentProvider) {
        currentProvider = model.provider;
        console.log(pc.bold(pc.cyan(`  ${currentProvider}`)));
      }
      
      const aliases = model.aliases?.length
        ? pc.dim(` (${model.aliases.join(", ")})`)
        : "";
      console.log(`    ${model.id}${aliases}`);
    }
    console.log("");
    return;
  }

  // Get input text
  logStatus(pc.dim("Reading input..."));
  const inputText = await getInput({ text, file: options.file });
  const charCount = inputText.length;
  const inputPreview = inputText.length > 50 
    ? inputText.slice(0, 50).replace(/\n/g, " ") + "..." 
    : inputText.replace(/\n/g, " ");
  logDone(`${pc.green("Input:")} ${pc.dim(`"${inputPreview}"`)} ${pc.dim("(")}${pc.bold(charCount.toLocaleString())}${pc.dim(" chars)")}`);

  // Collect results
  const results: TokenCount[] = [];
  const errors: Error[] = [];

  if (options.model) {
    // Count for specific model
    logStatus(pc.dim(`Finding provider for ${pc.bold(options.model)}...`));
    const provider = await registry.findProviderForModel(options.model);
    if (!provider) {
      throw new TokenCountError(
        `No provider found for model: ${options.model}`,
        "INVALID_MODEL"
      );
    }
    if (!provider.isAvailable()) {
      throw new TokenCountError(
        `Provider '${provider.name}' requires configuration (missing API key?)`,
        "MISSING_API_KEY"
      );
    }
    
    logStatus(pc.dim(`Counting tokens with ${pc.cyan(provider.name)}/${pc.bold(options.model)}...`));
    results.push(await provider.countTokens(inputText, options.model));
    logDone(`${pc.green("Done:")} Counted tokens for ${pc.cyan(options.model)}`);
  } else {
    // Count for ALL providers
    const allProviders = registry.all();
    const availableProviders = registry.available();
    const unavailableProviders = registry.unavailable();

    if (availableProviders.length === 0) {
      console.warn(
        pc.yellow("Warning: No providers are available. Set API keys to enable providers:")
      );
      for (const provider of unavailableProviders) {
        console.warn(pc.dim(`  - ${provider.name}`));
      }
      return;
    }

    // Count models for display
    logStatus(pc.dim("Fetching available models..."));
    let totalModels = 0;
    for (const provider of availableProviders) {
      const models = await provider.getModels();
      totalModels += models.length;
    }
    
    logDone(`${pc.green("Found:")} ${pc.bold(String(totalModels))} models across ${pc.bold(String(availableProviders.length))} providers`);

    // Count tokens for available providers
    for (const provider of availableProviders) {
      logStatus(pc.dim(`Counting tokens with ${pc.cyan(provider.name)}...`));
      try {
        const providerResults = await provider.countTokensAllModels(inputText);
        results.push(...providerResults);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    // Add skipped entries for unavailable providers
    for (const provider of unavailableProviders) {
      const models = await provider.getModels();
      for (const model of models) {
        results.push({
          provider: provider.name,
          model: model.id,
          displayName: model.displayName,
          tokens: 0,
          source: "",
          featured: true,
          skipped: true,
          skipReason: "missing API key",
        });
      }
    }
    
    logDone(`${pc.green("Completed:")} Counted tokens for ${pc.bold(String(results.length - unavailableProviders.reduce((acc, p) => acc + (p as any).cachedModels?.length || 0, 0)))} models`);
  }

  // Output results
  console.log("");
  console.log(formatOutput(results, options.output as OutputFormat, { charCount }));

  // Show errors in verbose mode
  if (options.verbose && errors.length > 0) {
    console.error(pc.yellow("\nErrors encountered:"));
    errors.forEach((e) => console.error(pc.red(`  - ${e.message}`)));
  }
}

function handleError(err: unknown, verbose?: boolean): void {
  if (err instanceof TokenCountError) {
    console.error(pc.red(`Error: ${err.message}`));
    if (verbose) {
      console.error(pc.dim(`Code: ${err.code}`));
    }
    process.exit(1);
  }

  console.error(pc.red("Unexpected error:"), err);
  process.exit(1);
}
