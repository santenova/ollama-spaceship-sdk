/**
 * Shared thin wrapper for OpenAI-API-style calls to any local Ollama endpoint.
 * All feature modules import from here — no circular dep on client.ts.
 */
/** Pick the first non-empty endpoint from the list. */
export declare function resolveEndpoint(ollamaEndpoints: string[]): string;
/** POST to /v1/chat/completions and return parsed response text (or JSON). */
export declare function chatCompletion(ollamaEndpoints: string[], model: string, messages: Array<{
    role: string;
    content: string;
}>, opts?: {
    temperature?: number;
    max_tokens?: number;
    response_json_schema?: Record<string, any> | null;
    signal?: AbortSignal;
}): Promise<string | any>;
export interface ChatCompletionUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
export interface ChatCompletionResult {
    content: string;
    usage: ChatCompletionUsage | null;
}
/** POST to /v1/chat/completions and return content + token usage metadata. */
export declare function chatCompletionWithUsage(ollamaEndpoints: string[], model: string, messages: Array<{
    role: string;
    content: string;
}>, opts?: {
    temperature?: number;
    max_tokens?: number;
    response_json_schema?: Record<string, any> | null;
    signal?: AbortSignal;
}): Promise<ChatCompletionResult>;
/** POST to /v1/embeddings and return the embedding vector. */
export declare function embedText(ollamaEndpoints: string[], model: string, text: string, signal?: AbortSignal): Promise<number[] | null>;
/**
 * Parse an SSE (Server-Sent Events) response body, calling `onToken` for each
 * content delta. Used by invokeLLM, streamResponse, and ollama-tracker.
 *
 * Usage:
 *   await parseSSE(res, (delta) => { content += delta; onToken?.(delta); });
 */
export declare function parseSSE(res: Response, onToken: (delta: string) => void): Promise<void>;
/** Cosine similarity between two equal-length vectors. */
export declare function cosineSimilarity(a: number[], b: number[]): number;
