/**
 * Circuit Breaker (Improvement #3)
 * Tracks error rates and switches to fallback after threshold,
 * then periodically attempts to restore primary connection.
 */
export function createCircuitBreaker(name, opts = {}) {
    const { failureThreshold = 3, recoveryTimeMs = 30000, onStateChange, } = opts;
    let state = 'closed';
    let failureCount = 0;
    let lastFailureTime = 0;
    const setState = (next) => {
        if (state !== next) {
            state = next;
            console.warn(`[CircuitBreaker:${name}] → ${next}`);
            onStateChange?.(next);
        }
    };
    return {
        get state() { return state; },
        /** Returns true if the circuit allows the call to proceed */
        canCall() {
            if (state === 'closed')
                return true;
            if (state === 'open') {
                if (Date.now() - lastFailureTime >= recoveryTimeMs) {
                    setState('half-open');
                    return true;
                }
                return false;
            }
            return true; // half-open: allow one probe
        },
        /** Call after a successful operation */
        onSuccess() {
            failureCount = 0;
            setState('closed');
        },
        /** Call after a failed operation */
        onFailure() {
            failureCount++;
            lastFailureTime = Date.now();
            if (failureCount >= failureThreshold) {
                setState('open');
            }
        },
        reset() {
            failureCount = 0;
            setState('closed');
        },
    };
}
