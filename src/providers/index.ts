import { registry, registerProvider } from "../registry";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import { XAIProvider } from "./xai";
import { MoonshotProvider } from "./moonshot";
import { AlibabaProvider } from "./alibaba";
import { ZhipuProvider } from "./zhipu";
import { MiniMaxProvider } from "./minimax";

// Auto-register all built-in providers
registerProvider(new AnthropicProvider());
registerProvider(new OpenAIProvider());
registerProvider(new GoogleProvider());
registerProvider(new XAIProvider());
registerProvider(new MoonshotProvider());
registerProvider(new AlibabaProvider());
registerProvider(new ZhipuProvider());
registerProvider(new MiniMaxProvider());

export { registry };
export { AnthropicProvider } from "./anthropic";
export { OpenAIProvider } from "./openai";
export { GoogleProvider } from "./google";
export { XAIProvider } from "./xai";
export { MoonshotProvider } from "./moonshot";
export { AlibabaProvider } from "./alibaba";
export { ZhipuProvider } from "./zhipu";
export { MiniMaxProvider } from "./minimax";
export { BaseProvider } from "./base";
