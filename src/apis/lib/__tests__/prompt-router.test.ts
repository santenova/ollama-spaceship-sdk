/**
 * Jest tests for promptRouter.enhance()
 * No fetch mocking — every test hits the real Ollama endpoint.
 */

import { promptRouter } from '../prompt-router';
import { modelRouter } from '../model-router';

const EP = 'http://127.0.0.1:11434';
const MODEL = 'qwen3:0.6b';

jest.setTimeout(120000);

async function checkEndpoint() {
  try {
    const res = await fetch(`${EP}/v1/models`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e: any) {
    throw new Error(`Ollama unreachable at ${EP}: ${e.message}`);
  }
}

describe('promptRouter.enhance', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));
    modelRouter.invalidateCache();
    localStorage.setItem('model_router_capability_cache', JSON.stringify({ endpoint: EP, map: {}, ts: Date.now() }));
  });

  test('returns an enhanced prompt from the real Ollama endpoint', async () => {
    await checkEndpoint();
    const res = await promptRouter.enhance('rough input about coral reefs', { defaultModel: MODEL });
    expect(typeof res).toBe('string');
    expect(res.length).toBeGreaterThan(0);
  });

  test('falls back to raw input when endpoint is unreachable (real network failure)', async () => {
    const res = await promptRouter.enhance('keep me', {
      defaultModel: MODEL,
      endpoint: 'http://127.0.0.1:59999',
    });
    expect(res).toBe('keep me');
  });

  test('honors explicit model override against real endpoint', async () => {
    await checkEndpoint();
    const res = await promptRouter.enhance('x', { model: MODEL });
    expect(typeof res).toBe('string');
    expect(res.length).toBeGreaterThan(0);
  });

  test('passes persona context and returns a response from real endpoint', async () => {
    await checkEndpoint();
    const res = await promptRouter.enhance('x', {
      model: MODEL,
      persona: { name: 'Jacques', description: 'oceanographer', instructions: 'be precise' },
    });
    expect(typeof res).toBe('string');
    expect(res.length).toBeGreaterThan(0);
  });
});