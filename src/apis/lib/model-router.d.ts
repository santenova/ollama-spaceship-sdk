/**
 * Capability-aware Model Router (Improvement #8)
 * Uses Ollama's /api/show capabilities to select the best available model
 * for a given task, ranked by parameter count (larger = better).
 * Falls back to static hints if Ollama is unreachable.
 *
 * Cache hierarchy (avoids re-running the 50-request /api/show discovery):
 *   1. In-memory map         — instant, per-session
 *   2. localStorage           — instant, per-browser
 *   3. Elasticsearch index    — one network call, shared across ALL clients
 *   4. Live Ollama discovery  — 1 + N requests (50 models), runs at most
 *                              once per day per endpoint, then writes to
 *                              all three layers above.
 */
type BuiltInTaskType = 'chat' | 'websearch' | 'vision' | 'thinking' | 'json' | 'tool_call' | 'embedding';
export type TaskType = BuiltInTaskType | (string & {});
export type ModelPriority = 'quality' | 'speed';
/** Options object form for resolve — lets callers pass Speed (0–100). */
export interface ResolveOptions {
    TaskType: TaskType;
    Speed?: number;
    defaultModel?: string;
    prompt?: string;
    priority?: ModelPriority;
    /**
     * Required capabilities filter. Only models registered under EVERY
     * capability in this list are considered. E.g. ['tools','thinking']
     * to find models that support both tools AND thinking.
     * Capped at the primary-capability bucket (TASK_TO_CAPABILITY[TaskType]).
     */
    requiredCaps?: string[];
}
export declare const modelRouter: {
    /** Read-only access to the in-memory capability cache (for diagnostics/tests) */
    readonly capabilityCache: Record<string, Record<string, number>> | null;
    /** Invalidate the capability cache (e.g. after endpoint change) */
    invalidateCache(): void;
    /**
     * Synchronous resolve — always instant (reads memory/localStorage).
     * A background refresh runs automatically when cache is stale.
     * Falls back to defaultModel if cache is empty (first ever cold start).
     *
     * Supports two call forms:
     *   resolve('chat', prompt, defaultModel, 'quality')        // positional (legacy)
     *   resolve({ TaskType: 'chat', Speed: 100 })               // options object
     *
     * Speed (0–100) ranks models by paramCount: 100 = fastest (smallest),
     * 0 = most capable (largest). Ignored if `priority` is set explicitly.
     */
    resolve(taskTypeOrOpts: TaskType | ResolveOptions, _prompt?: string, defaultModel?: string, priority?: ModelPriority): string;
    /**
     * Register a custom task type (or override an existing one) with an ordered
     * list of capability preferences. Lets callers extend routing at runtime
     * without editing this file.
     *
     * Usage:
     *   modelRouter.registerTaskType('translation', ['tools', 'completion']);
     *   modelRouter.resolve({ TaskType: 'translation', Speed: 50, defaultModel: 'fb' });
     */
    registerTaskType(taskType: string, capabilities: string[]): void;
    /** Read-only access to the full task→capabilities preference map. */
    readonly taskCapabilities: Record<string, string[]>;
    /**
     * Return ALL available models for a given task type, sorted fastest-first
     * (ascending paramCount). Useful for beaming (fan-out to all models).
     * Falls back to [defaultModel] when the cache is empty.
     */
    resolveAll(taskType: TaskType, defaultModel: string): string[];
    /** Kept for backward compat — now just wraps the sync resolve (always Speed=100) */
    resolveAsync(taskType: TaskType, defaultModel: string, _priority?: ModelPriority): Promise<string>;
};
export {};
