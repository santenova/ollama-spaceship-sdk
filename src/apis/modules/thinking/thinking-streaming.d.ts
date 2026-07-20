/**
 * Thinking streaming — streams thoughts and responses from the LLM using
 * vanilla fetch against Ollama's OpenAI-compatible /v1/chat/completions
 * endpoint with SSE parsing.
 *
 * The previous version of this file used the `ollama` npm SDK and
 * `process.stdout.write`, neither of which work in the browser. The
 * function below mirrors the SSE parsing pattern from the test suite and
 * uses plain `fetch` so it works in both browser and Node.
 */
interface ThinkingStreamingConfig {
    ollamaEndpoints: string[];
    model?: string | null;
    defaultModel?: string;
}
interface ThinkingStreamingResult {
    thinking: string;
    content: string;
    chunks: number;
}
/**
 * Streams thoughts and responses from the LLM. Returns the accumulated
 * thinking trace and content after the stream closes.
 */
export declare function thinkingStreamingFetch(prompt: string, config: ThinkingStreamingConfig): Promise<ThinkingStreamingResult>;
export {};
