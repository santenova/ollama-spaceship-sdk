/**
 * Calculator — Ollama OpenAI-compatible tool-calling demo for arithmetic.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below mirrors
 * the pattern used by `multi-tool.ts`: it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */
/**
 * Standalone calculator — calls Ollama's OpenAI-compatible
 * /v1/chat/completions endpoint with add/subtract tools.
 * Accepts an optional prompt (defaults to "three minus one") and
 * returns the final assistant content string.
 */
export declare function calculator(opts: {
    prompt?: string;
    model?: string | null;
    ollamaEndpoints: string[];
    defaultModel: string;
}): Promise<any>;
