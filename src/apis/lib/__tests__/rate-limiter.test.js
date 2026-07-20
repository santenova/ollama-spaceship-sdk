import { createRateLimiter } from '../rate-limiter';
describe('createRateLimiter', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });
    test('allows calls within the limit without waiting', async () => {
        const limiter = createRateLimiter('test', { maxCalls: 3, windowMs: 1000 });
        await limiter.acquire();
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.available).toBeCloseTo(0, 0);
    });
    test('queues calls beyond the limit and releases them', async () => {
        const limiter = createRateLimiter('test2', { maxCalls: 2, windowMs: 500 });
        // Exhaust the 2 tokens
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.available).toBeCloseTo(0, 0);
        // This one should queue
        let resolved = false;
        limiter.acquire().then(() => { resolved = true; });
        // Still queued after a tick
        await Promise.resolve();
        expect(resolved).toBe(false);
        // Advance past the window — token should refill
        jest.advanceTimersByTime(501);
        await Promise.resolve();
        expect(resolved).toBe(true);
    });
    test('run wraps a function with acquire/release', async () => {
        let callCount = 0;
        const limiter = createRateLimiter('test3', { maxCalls: 1, windowMs: 200 });
        const result = await limiter.run(async () => {
            callCount++;
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(callCount).toBe(1);
    });
    test('reset clears tokens and queue', async () => {
        const limiter = createRateLimiter('test4', { maxCalls: 1, windowMs: 100 });
        await limiter.acquire();
        // One queued
        let resolved = false;
        limiter.acquire().then(() => { resolved = true; });
        await Promise.resolve();
        expect(resolved).toBe(false);
        limiter.reset();
        // After reset, we can acquire again immediately
        await limiter.acquire();
        expect(limiter.available).toBeCloseTo(0, 0);
    });
    test('available returns fractional tokens over time', () => {
        const limiter = createRateLimiter('test5', { maxCalls: 10, windowMs: 1000 });
        expect(limiter.available).toBeCloseTo(10, 0);
        jest.advanceTimersByTime(500);
        // Still max (can't exceed cap)
        expect(limiter.available).toBeCloseTo(10, 0);
    });
    test('unlimited mode never blocks acquire calls', async () => {
        const limiter = createRateLimiter('unlimited-test', { unlimited: true });
        // Many calls — all should succeed immediately
        for (let i = 0; i < 100; i++) {
            await limiter.acquire();
        }
        expect(limiter.available).toBe(Infinity);
    });
    test('unlimited mode run() passes through without throttling', async () => {
        const limiter = createRateLimiter('unlimited-run', { unlimited: true });
        const result = await limiter.run(async () => 'passthrough');
        expect(result).toBe('passthrough');
        expect(limiter.available).toBe(Infinity);
    });
    test('unlimited mode ignores maxCalls/windowMs', async () => {
        const limiter = createRateLimiter('unlimited-ignores', { unlimited: true, maxCalls: 1, windowMs: 100 });
        // Even though maxCalls=1, unlimited bypasses it
        await limiter.acquire();
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.available).toBe(Infinity);
    });
});
