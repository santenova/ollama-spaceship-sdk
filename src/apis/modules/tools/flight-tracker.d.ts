/**
 * Flight tracker — Ollama OpenAI-compatible tool-calling demo for flight times.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below mirrors
 * the pattern used by `multi-tool.ts`: it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */
/**
 * Standalone flightTracker — calls Ollama's OpenAI-compatible
 * /v1/chat/completions endpoint with a mock flight-times tool.
 * Accepts an optional prompt (defaults to the LGA→LAX demo) and
 * returns the final assistant content string.
 */
export declare function flightTracker(opts: {
    prompt?: string;
    model?: string | null;
    ollamaEndpoints: string[];
    defaultModel: string;
}): Promise<any>;
