/**
 * Multi-tool run — Ollama OpenAI-compatible tool-calling demo.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below is the one
 * that was previously inlined in `apis/client.ts` and is the actually-used
 * implementation — it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */
/**
 * Standalone multiToolRun — calls Ollama's OpenAI-compatible
 * /v1/chat/completions endpoint with mock weather tools.
 * Accepts an optional prompt (defaults to a weather demo prompt) and
 * returns the accumulated assistant content string.
 */
export declare function multiToolRun(opts: {
    prompt?: string;
    model?: string | null;
    ollamaEndpoints: string[];
    defaultModel: string;
}): Promise<any>;
