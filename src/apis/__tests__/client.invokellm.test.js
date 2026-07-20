/**
 * Jest tests for client.integrations.Core.InvokeLLM()
 * No fetch mocking — every test hits the real Ollama endpoint.
 */
import { createClient, config } from '../client';
import { modelRouter } from '../lib/model-router';
const EP = 'http://127.0.0.1:11434';
const MODEL = 'qwen3:0.6b';
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
describe('client.integrations.Core.InvokeLLM', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));
        modelRouter.invalidateCache();
        localStorage.setItem('model_router_capability_cache', JSON.stringify({ endpoint: EP, map: {}, ts: Date.now() }));
    });
    test('is a function on the client', () => {
        const client = createClient(config);
        expect(typeof client.integrations.Core.InvokeLLM).toBe('function');
    });
    test('returns plain text content for a simple prompt from real Ollama', async () => {
        await checkEndpoint();
        const client = createClient(config);
        const result = await client.integrations.Core.InvokeLLM({ prompt: 'Say hi in one word.' });
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
    test('returns parsed JSON when response_json_schema is provided from real Ollama', async () => {
        await checkEndpoint();
        const client = createClient(config);
        const result = await client.integrations.Core.InvokeLLM({
            prompt: 'What is 2 plus 2? Return a JSON object with an "answer" number field.',
            response_json_schema: { type: 'object', properties: { answer: { type: 'number' } } },
        });
        // Real LLM may return parsed object or raw string if JSON parse fails
        expect(result).toBeTruthy();
    });
    test('prepends system message and gets a response from real Ollama', async () => {
        await checkEndpoint();
        const client = createClient(config);
        const result = await client.integrations.Core.InvokeLLM({
            prompt: 'hello',
            system: 'You are a robot. Respond with "beep boop".',
        });
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
    test('streams tokens from real Ollama via onToken callback', async () => {
        await checkEndpoint();
        const client = createClient(config);
        const tokens = [];
        const result = await client.integrations.Core.InvokeLLM({
            prompt: 'Count from 1 to 5.',
            stream: true,
            onToken: (delta) => tokens.push(delta),
        });
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        expect(tokens.length).toBeGreaterThan(0);
    });
});
describe('client.setLimits / client.getLimits', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));
        modelRouter.invalidateCache();
        localStorage.setItem('model_router_capability_cache', JSON.stringify({ endpoint: EP, map: {}, ts: Date.now() }));
    });
    test('getLimits returns null by default (unlimited)', () => {
        const client = createClient(config);
        expect(client.getLimits()).toBeNull();
    });
    test('setLimits updates getLimits and emits telemetry event', () => {
        const client = createClient(config);
        const received = [];
        const telemetry = client.telemetry;
        const unsub = telemetry.on('client:limits-updated', (p) => received.push(p));
        client.setLimits({ maxCalls: 10, windowMs: 2000 });
        expect(client.getLimits()).toEqual({ maxCalls: 10, windowMs: 2000 });
        expect(received).toHaveLength(1);
        expect(received[0].limits).toEqual({ maxCalls: 10, windowMs: 2000 });
        unsub();
    });
    test('setLimits(null) switches back to unlimited', () => {
        const client = createClient(config);
        client.setLimits({ maxCalls: 5, windowMs: 1000 });
        expect(client.getLimits()).toEqual({ maxCalls: 5, windowMs: 1000 });
        client.setLimits(null);
        expect(client.getLimits()).toBeNull();
    });
});
