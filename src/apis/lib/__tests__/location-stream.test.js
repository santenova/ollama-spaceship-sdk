"use strict";
/**
 * Jest tests for location metadata in streams and location-aware rate limiting.
 * No fetch mocking — streaming tests hit the real Ollama endpoint.
 * Location resolution uses real IP geolocation APIs (falls back to 0,0 on failure).
 */
const EP = 'http://127.0.0.1:11434';
jest.setTimeout(120000);
async function checkEndpoint() {
    try {
        const res = await fetch(`${EP}/v1/models`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
    }
    catch (e) {
        throw new Error(`Ollama unreachable at ${EP}: ${e.message}`);
    }
}
async function streamToArray(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.subscribe({
            next: (chunk) => chunks.push(chunk),
            error: (err) => reject(err),
            complete: () => resolve(chunks),
        });
    });
}
let LocationService;
let RateLimiterClass;
describe('streamResponse — location metadata', () => {
    let ollamaUp = false;
    const skipIfDown = () => {
        if (!ollamaUp)
            pending('Ollama unreachable — skipping');
    };
    beforeAll(async () => {
        LocationService = (await import('../location')).LocationService;
        try {
            const res = await fetch(`${EP}/v1/models`, { signal: AbortSignal.timeout(5000) });
            ollamaUp = res.ok;
        }
        catch {
            ollamaUp = false;
        }
    });
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));
        LocationService.clearCache();
    });
    test('includes location metadata (lat/lng) in streamed chunks from real Ollama', async () => {
        skipIfDown();
        const mod = await import('../../client');
        const client = mod.createClient(mod.config);
        client.updateConfig({ ollamaEndpoints: [EP], model: 'qwen3:0.6b' });
        const stream = client.streamResponse('chat', 'Say hello');
        const chunks = await streamToArray(stream);
        expect(chunks.length).toBeGreaterThan(0);
        for (const chunk of chunks) {
            expect(chunk).toHaveProperty('lat');
            expect(chunk).toHaveProperty('lng');
        }
        const text = chunks.map((c) => c.text).join('');
        expect(text.length).toBeGreaterThan(0);
    });
    test('survives location lookup and still streams from real endpoint', async () => {
        skipIfDown();
        const mod = await import('../../client');
        const client = mod.createClient(mod.config);
        client.updateConfig({ ollamaEndpoints: [EP], model: 'qwen3:0.6b' });
        const stream = client.streamResponse('chat', 'Say hello');
        const chunks = await streamToArray(stream);
        expect(chunks.length).toBeGreaterThan(0);
        for (const chunk of chunks) {
            expect(chunk).toHaveProperty('lat');
            expect(chunk).toHaveProperty('lng');
        }
    });
});
describe('RateLimiter (rate-limiter.ts) — token bucket', () => {
    test('basic run() wraps a function without throwing', async () => {
        const { createRateLimiter } = await import('../rate-limiter');
        const limiter = createRateLimiter('test', { maxCalls: 10, windowMs: 1000 });
        const result = await limiter.run(async () => 'done');
        expect(result).toBe('done');
        expect(limiter.available).toBeGreaterThanOrEqual(0);
    });
    test('unlimited mode passes through immediately', async () => {
        const { createRateLimiter } = await import('../rate-limiter');
        const limiter = createRateLimiter('unlimited', { unlimited: true });
        expect(limiter.available).toBe(Infinity);
        await expect(limiter.run(async () => 'ok')).resolves.toBe('ok');
    });
    test('reset restores full token count', async () => {
        const { createRateLimiter } = await import('../rate-limiter');
        const limiter = createRateLimiter('reset-test', { maxCalls: 5, windowMs: 60000 });
        await limiter.acquire();
        await limiter.acquire();
        limiter.reset();
        expect(limiter.available).toBeCloseTo(5, 0);
    });
});
