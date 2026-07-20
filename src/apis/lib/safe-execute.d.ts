/**
 * Unified error handler / decorator (#1)
 * Wraps any async integration call with consistent logging, telemetry,
 * and circuit-breaker interaction so individual modules stay free of
 * boilerplate try/catch blocks.
 */
interface SafeExecuteOpts<T> {
    /** Human-readable label used for logging and telemetry events */
    label: string;
    /** The async operation to run */
    fn: () => Promise<T>;
    /** Optional fallback value returned on failure instead of re-throwing */
    fallback?: T;
    /** Optional circuit-breaker instance ({ canCall, onSuccess, onFailure }) */
    circuitBreaker?: {
        canCall(): boolean;
        onSuccess(): void;
        onFailure(): void;
    };
}
/**
 * Execute `fn` with unified telemetry, structured logging, and optional
 * circuit-breaker enforcement.
 *
 * Usage:
 *   const result = await safeExecute({
 *     label: 'InvokeLLM',
 *     fn: () => invokeLLM(params),
 *     circuitBreaker,
 *   });
 */
export declare function safeExecute<T>(opts: SafeExecuteOpts<T>): Promise<T>;
export {};
