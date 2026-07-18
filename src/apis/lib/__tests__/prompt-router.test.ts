/**
 * Jest tests for promptRouter.enhance()
 * No fetch mocking — every test hits the real Ollama endpoint.
 */

import { promptRouter } from '../prompt-router';
import { modelRouter } from '../model-router';
import { createClient, config } from '../../client';

// Endpoint fetched from the apis client instance — never hardcoded in tests.
const EP = createClient(config).getConfig().ollamaEndpoints[0];
const MODEL = 'qwen3:0.6b';

async function checkEndpoint() {
  try {
    const res = await fetch(`${EP}/v1/models`, { signal: AbortSignal.timeout(100000) });
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


  test('falls back to raw input when endpoint is unreachable (real network failure)', async () => {
    const res = await promptRouter.enhance('keep me', {
      defaultModel: MODEL,
      endpoint: 'http://127.0.0.1:59999',
    });
    expect(res).toBe('keep me');
  });
});
