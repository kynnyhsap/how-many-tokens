import { TokenCountError } from "./types";

export async function getInput(options: {
  text?: string;
  file?: string;
}): Promise<string> {
  // Priority: explicit text > file > stdin

  if (options.text) {
    return options.text;
  }

  if (options.file) {
    const file = Bun.file(options.file);
    if (!(await file.exists())) {
      throw new TokenCountError(
        `File not found: ${options.file}`,
        "FILE_NOT_FOUND"
      );
    }
    return file.text();
  }

  // Check for piped stdin
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf-8");
    if (text.trim()) {
      return text;
    }
  }

  throw new TokenCountError(
    "No input provided. Use --file, pass text as argument, or pipe to stdin.",
    "NO_INPUT"
  );
}
