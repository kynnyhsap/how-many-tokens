# how-many-tokens

Count tokens for text across multiple LLM providers in one command.

## Install

### From Binary (Recommended)

```bash
# Clone and install
git clone https://github.com/kynnyhsap/how-many-tokens.git
cd how-many-tokens
./install.sh
```

This compiles a native binary and installs it to `~/.local/bin/hmt`.

### From Source

```bash
bun add -g how-many-tokens
```

### Run Directly

```bash
bunx how-many-tokens "Hello, world!"
```

## Usage

```bash
# Count tokens for inline text
hmt "Hello, world!"

# Count tokens from a file
hmt -f src/index.ts

# Pipe from stdin
cat README.md | hmt

# Count for a specific model
hmt "Hello" -m sonnet-4.5

# Output as JSON
hmt "Hello" -o json

# List all supported models
hmt --list-models
```

## Supported Models

Focused on the best models for coding (based on [models.dev](https://models.dev)):

| Provider | Models | Token Source | API Key Required |
|----------|--------|--------------|------------------|
| **Anthropic** | Claude Sonnet 4.5, Sonnet 4, Opus 4.5, Opus 4.1, Haiku 4.5, Haiku 3.5 | API | Yes |
| **OpenAI** | GPT-5.2, GPT-5.1, GPT-5 (+ Codex variants) | tiktoken | No |
| **Google** | Gemini 3 Pro/Flash, Gemini 2.5 Pro/Flash | API | Yes |
| **xAI** | Grok Code Fast 1 | tiktoken | No |
| **Moonshot** | Kimi K2, Kimi K2 Thinking | API | Yes |
| **Alibaba** | Qwen3 Coder 480B | tiktoken | No |
| **Zhipu** | GLM 4.7, GLM 4.6 | API | Yes |
| **MiniMax** | MiniMax M2.1 | tiktoken | No |

## Environment Variables

Only needed for API-based providers:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."   # Claude models (required)
export GOOGLE_API_KEY="..."             # Gemini models (required)
export MOONSHOT_API_KEY="..."           # Kimi models (required)
export ZHIPU_API_KEY="..."              # GLM models (required)
```

Providers using tiktoken (OpenAI, xAI, Alibaba, MiniMax) work offline without any API keys.

## Options

```
-f, --file <path>   Read input from file
-m, --model <id>    Count for specific model only
-o, --output <fmt>  Output format: table, json, simple
--list-models       List all supported models
-v, --verbose       Show errors and debug info
-h, --help          Show help
-V, --version       Show version
```

## Model Aliases

Use short aliases instead of full model IDs:

```bash
hmt "Hello" -m sonnet-4.5      # claude-sonnet-4-5-20250929
hmt "Hello" -m opus-4.5        # claude-opus-4-5-20251101
hmt "Hello" -m codex           # gpt-5-codex
hmt "Hello" -m kimi            # kimi-k2-0905-preview
hmt "Hello" -m grok            # grok-code-fast-1
hmt "Hello" -m qwen            # qwen3-coder-480b-a35b-instruct
hmt "Hello" -m glm             # glm-4.7
```

## Output Formats

**Table** (default):
```
 Provider  | Model             | Tokens | Chars/Token | Source
-----------+-------------------+--------+-------------+-------------------
 anthropic | claude-sonnet-4-5 |     11 |         1.2 | api.anthropic.com
 openai    | gpt-5.2           |      4 |         3.3 | tiktoken
```

**JSON** (`-o json`):
```json
[
  {"provider": "anthropic", "model": "claude-sonnet-4-5", "tokens": 11, "source": "api.anthropic.com"},
  {"provider": "openai", "model": "gpt-5.2", "tokens": 4, "source": "tiktoken"}
]
```

**Simple** (`-o simple`):
```
anthropic/claude-sonnet-4-5: 11 tokens
openai/gpt-5.2: 4 tokens
```

## License

MIT
