/**
 * Token-bucket rate limiter for backend API calls.
 *
 * Tokens refill at `maxCalls / windowMs` per ms. When tokens are exhausted,
 * callers are queued and woken as tokens become available.
 *
 * Usage:
 *   const limiter = createRateLimiter('api', { maxCalls: 10, windowMs: 1000 });
 *   await limiter.acquire();         // blocks until a token is available
 *   await limiter.run(() => fetch(…)); // auto-acquire + release
 */
export interface RateLimiterOptions {
    /** Maximum calls allowed within the window (default: 30). */
    maxCalls?: number;
    /** Rolling window duration in milliseconds (default: 1000). */
    windowMs?: number;
    /** When true (or maxCalls ≤ 0), rate limiting is disabled — all calls pass through immediately. */
    unlimited?: boolean;
}
export interface RateLimiter {
    readonly name: string;
    /** Block until a token is available, then consume it. */
    acquire(): Promise<void>;
    /** Wrap a promise-returning function with acquire/release. */
    run<T>(fn: () => Promise<T>): Promise<T>;
    /** Number of tokens currently available (may be fractional). */
    readonly available: number;
    /** Reset to full tokens and clear the queue. */
    reset(): void;
}
export declare function createRateLimiter(name: string, opts?: RateLimiterOptions): RateLimiter;
