/**
 * Prompt Router
 * Uses the modelRouter to pick the best model for a task, then calls the
 * Ollama OpenAI-compatible /v1/chat/completions endpoint to enhance a raw
 * input into a richer, more specific prompt (optionally persona-aware).
 *
 * Exposed on the client as `client.promptRouter`.
 */
export type PromptTaskType = 'chat' | 'thinking' | 'json' | 'vision' | 'tool_call' | 'websearch';
export interface EnhanceOptions {
    /** Task type — drives model selection via modelRouter */
    TaskType?: PromptTaskType;
    /** Speed 0–100 (100 = fastest). Defaults to 100 like modelRouter positional calls */
    Speed?: number;
    /** Fallback model if modelRouter cache is empty */
    defaultModel?: string;
    /** Required capabilities filter — only models with ALL listed capabilities are considered */
    requiredCaps?: string[];
    /** Endpoint override; defaults to localStorage 'ollama_endpoints[0]' */
    endpoint?: string;
    /** Model override; bypasses modelRouter entirely when set */
    model?: string;
    /** Optional persona context for the enhancement system prompt */
    persona?: {
        name?: string;
        description?: string;
        instructions?: string;
    };
    /** Sampling temperature (0–2). Defaults to 0.7 */
    temperature?: number;
    /** Max tokens for the enhanced prompt. Defaults to 1024 */
    maxTokens?: number;
    /** Optional abort signal — wired to the underlying fetch for cancellation. */
    signal?: AbortSignal;
}
export declare const promptRouter: {
    /**
     * Enhance a raw prompt using the OpenAI-style API.
     * Routes the best model for the given task via modelRouter.
     * Falls back to the raw prompt on any error (never throws).
     */
    enhance(raw: string, opts?: EnhanceOptions): Promise<string>;
};
