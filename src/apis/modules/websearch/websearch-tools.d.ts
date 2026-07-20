/**
 * Websearch tools — standalone web search via Ollama's OpenAI-compatible API.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but that
 * package is not installed in this project. The function below is the one that
 * was previously inlined in `apis/client.ts` and is the actually-used
 * implementation — it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */
/**
 * Standalone webSearch — calls Ollama's OpenAI-compatible /v1/chat/completions
 * endpoint. Returns the accumulated assistant content string.
 */
export declare function webSearch(opts: {
    prompt: string;
    model?: string | null;
    ollamaEndpoints: string[];
    defaultModel: string;
}): Promise<any>;
