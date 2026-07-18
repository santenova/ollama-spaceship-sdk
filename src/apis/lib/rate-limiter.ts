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

export function createRateLimiter(
  name: string,
  opts: RateLimiterOptions = {},
): RateLimiter {
  const { maxCalls = 30, windowMs = 1000, unlimited = false } = opts;
  const isUnlimited = unlimited || maxCalls <= 0;
  const refillRate = maxCalls / windowMs; // tokens per ms

  let tokens = maxCalls;
  let lastRefill = Date.now();
  let queue: Array<() => void> = [];
  let timerId: ReturnType<typeof setTimeout> | null = null;

  function refill() {
    const now = Date.now();
    const elapsed = now - lastRefill;
    if (elapsed > 0) {
      tokens = Math.min(maxCalls, tokens + elapsed * refillRate);
      lastRefill = now;
    }
  }

  function dequeue() {
    refill();
    while (queue.length > 0 && tokens >= 1) {
      tokens -= 1;
      const resolve = queue.shift()!;
      resolve();
    }
    // Schedule another wake-up if the queue is still non-empty
    if (queue.length > 0 && timerId === null) {
      const waitMs = Math.max(1, Math.ceil((1 - tokens) / refillRate));
      timerId = setTimeout(() => {
        timerId = null;
        dequeue();
      }, waitMs);
    }
  }

  const limiter: RateLimiter = {
    name,

    acquire(): Promise<void> {
      if (isUnlimited) return Promise.resolve();
      refill();
      if (tokens >= 1) {
        tokens -= 1;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        queue.push(resolve);
        if (timerId === null) {
          const waitMs = Math.max(1, Math.ceil(1 / refillRate));
          timerId = setTimeout(() => {
            timerId = null;
            dequeue();
          }, waitMs);
        }
      });
    },

    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (!isUnlimited) await limiter.acquire();
      return fn();
    },

    get available() {
      if (isUnlimited) return Infinity;
      refill();
      return tokens;
    },

    reset() {
      if (isUnlimited) return;
      if (timerId !== null) clearTimeout(timerId);
      timerId = null;
      tokens = maxCalls;
      lastRefill = Date.now();
      queue = [];
    },
  };

  return limiter;
}