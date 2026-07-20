/**
 * Circuit Breaker (Improvement #3)
 * Tracks error rates and switches to fallback after threshold,
 * then periodically attempts to restore primary connection.
 */
type CircuitState = 'closed' | 'open' | 'half-open';
interface CircuitBreakerOptions {
    failureThreshold?: number;
    recoveryTimeMs?: number;
    onStateChange?: (state: CircuitState) => void;
}
export declare function createCircuitBreaker(name: string, opts?: CircuitBreakerOptions): {
    readonly state: CircuitState;
    /** Returns true if the circuit allows the call to proceed */
    canCall(): boolean;
    /** Call after a successful operation */
    onSuccess(): void;
    /** Call after a failed operation */
    onFailure(): void;
    reset(): void;
};
export {};
