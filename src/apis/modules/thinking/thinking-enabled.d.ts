/**
 * Thinking enabled — non-streaming request with thinking trace via Ollama's
 * OpenAI-compatible /v1/chat/completions endpoint.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below mirrors
 * the pattern used by the other modules: plain `fetch` so it works in both
 * browser and Node.
 */
interface ThinkingEnabledConfig {
    ollamaEndpoints: string[];
    model?: string | null;
    defaultModel?: string;
}
interface ThinkingEnabledResult {
    thinking: string;
    content: string;
}
/**
 * Sends a prompt with think:true and returns both the thinking trace and
 * the final content. Non-streaming.
 */
export declare function thinkingEnabled(prompt: string, config: ThinkingEnabledConfig): Promise<ThinkingEnabledResult>;
export {};
