interface ThinkingLevelsConfig {
    ollamaEndpoints: string[];
    model?: string | null;
    defaultModel?: string;
}
/**
 * Thinking levels — iterates over low/medium/high thinking levels using
 * Ollama's OpenAI-compatible /v1/chat/completions endpoint.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below uses
 * plain `fetch` so it works in both browser and Node.
 */
export declare function thinkingLevels(prompt: string, config: ThinkingLevelsConfig): Promise<void>;
export {};
