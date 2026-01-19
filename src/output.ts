import pc from "picocolors";
import type { TokenCount } from "./types";

export type OutputFormat = "table" | "json" | "simple";

export interface OutputOptions {
  charCount?: number;
}

/** Get the display model name - prefers displayName, falls back to model ID */
function getModelDisplay(result: TokenCount): string {
  // If user requested via alias, show "alias -> full_model"
  if (result.requestedAs) {
    return `${result.requestedAs} -> ${result.model}`;
  }
  // Otherwise use displayName (short alias) or fall back to full model ID
  return result.displayName || result.model;
}

export function formatOutput(
  results: TokenCount[],
  format: OutputFormat,
  options: OutputOptions = {}
): string {
  // Sort results: non-skipped first, then featured, then by provider
  const sortedResults = [...results].sort((a, b) => {
    // Non-skipped first
    if (a.skipped && !b.skipped) return 1;
    if (!a.skipped && b.skipped) return -1;
    // Featured models first
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    // Then by provider
    return a.provider.localeCompare(b.provider);
  });

  switch (format) {
    case "json":
      return JSON.stringify(
        {
          ...(options.charCount !== undefined && { characters: options.charCount }),
          results: sortedResults
            .filter((r) => !r.skipped)
            .map((r) => ({
              ...r,
              ...(options.charCount !== undefined && {
                charsPerToken: (options.charCount / r.tokens).toFixed(2),
              }),
            })),
          skipped: sortedResults
            .filter((r) => r.skipped)
            .map((r) => ({
              provider: r.provider,
              model: r.model,
              displayName: r.displayName,
              reason: r.skipReason,
            })),
        },
        null,
        2
      );

    case "simple":
      return sortedResults
        .map((r) => {
          const modelDisplay = getModelDisplay(r);
          if (r.skipped) {
            return `${r.provider}/${modelDisplay}: skipped (${r.skipReason})`;
          }
          const ratio = options.charCount !== undefined 
            ? ` (${(options.charCount / r.tokens).toFixed(1)} chars/token)`
            : "";
          return `${r.provider}/${modelDisplay}: ${r.tokens.toLocaleString()}${ratio}`;
        })
        .join("\n");

    case "table":
    default:
      return formatTable(sortedResults, options);
  }
}

function formatTable(results: TokenCount[], options: OutputOptions): string {
  if (results.length === 0) return pc.yellow("No results");

  const showRatio = options.charCount !== undefined;
  
  const headers = showRatio 
    ? ["Provider", "Model", "Tokens", "Chars/Token", "Source"]
    : ["Provider", "Model", "Tokens", "Source"];
  
  // Pre-compute model display strings for width calculation
  const modelDisplays = results.map(getModelDisplay);
  
  // For skipped results, show skip reason in source column
  const skipReasonText = "skipped: missing API key";
  
  const rows = results.map((r, i) => {
    if (r.skipped) {
      const base = [
        r.provider,
        modelDisplays[i],
        "-",
      ];
      if (showRatio) {
        base.push("-");
      }
      base.push(skipReasonText);
      return base;
    }
    
    const base = [
      r.provider,
      modelDisplays[i],
      r.tokens.toLocaleString(),
    ];
    
    if (showRatio) {
      const ratio = (options.charCount! / r.tokens).toFixed(1);
      base.push(ratio);
    }
    
    base.push(r.source);
    return base;
  });

  // Calculate column widths (using plain text, no ANSI codes)
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  );

  // Build table
  const separator = pc.dim(widths.map((w) => "-".repeat(w + 2)).join("+"));
  
  const formatHeaderRow = (cells: string[]) =>
    cells.map((c, i) => ` ${pc.bold(c.padEnd(widths[i]))} `).join(pc.dim("|"));
  
  const formatDataRow = (cells: string[], result: TokenCount) => {
    const formattedCells: string[] = [];
    const isFeatured = result.featured && !result.skipped;
    const isSkipped = result.skipped;
    
    // Provider
    const providerText = cells[0].padEnd(widths[0]);
    if (isSkipped) {
      formattedCells.push(` ${pc.dim(providerText)} `);
    } else {
      formattedCells.push(` ${isFeatured ? pc.cyan(providerText) : pc.dim(providerText)} `);
    }
    
    // Model
    if (result.requestedAs && !isSkipped) {
      const alias = result.requestedAs;
      const fullModel = result.model;
      const plainText = `${alias} -> ${fullModel}`;
      const padding = " ".repeat(widths[1] - plainText.length);
      formattedCells.push(` ${pc.bold(alias)} ${pc.dim("->")} ${fullModel}${padding} `);
    } else {
      const modelText = cells[1].padEnd(widths[1]);
      if (isSkipped) {
        formattedCells.push(` ${pc.dim(modelText)} `);
      } else {
        formattedCells.push(` ${isFeatured ? pc.bold(modelText) : pc.dim(modelText)} `);
      }
    }
    
    // Tokens
    const tokensText = cells[2].padStart(widths[2]);
    if (isSkipped) {
      formattedCells.push(` ${pc.dim(tokensText)} `);
    } else {
      formattedCells.push(` ${isFeatured ? pc.green(tokensText) : pc.dim(tokensText)} `);
    }
    
    // Chars/Token (if showing)
    let sourceIndex = 3;
    if (showRatio) {
      const ratioText = cells[3].padStart(widths[3]);
      if (isSkipped) {
        formattedCells.push(` ${pc.dim(ratioText)} `);
      } else {
        formattedCells.push(` ${isFeatured ? pc.yellow(ratioText) : pc.dim(ratioText)} `);
      }
      sourceIndex = 4;
    }
    
    // Source (or skip reason)
    const sourceText = cells[sourceIndex].padEnd(widths[sourceIndex]);
    if (isSkipped) {
      formattedCells.push(` ${pc.yellow(sourceText)} `);
    } else {
      formattedCells.push(` ${pc.dim(sourceText)} `);
    }
    
    return formattedCells.join(pc.dim("|"));
  };

  return [
    formatHeaderRow(headers),
    separator,
    ...rows.map((row, i) => formatDataRow(row, results[i])),
  ].join("\n");
}
