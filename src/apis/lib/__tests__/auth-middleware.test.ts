/**
 * Jest tests for createAuthMiddleware
 * Pure logic tests for injectAuthHeaders; withAuth hits the real Ollama endpoint.
 */

import { createAuthMiddleware } from '../auth-middleware';
import { createClient, config } from '../../client';

// Endpoint fetched from the apis client instance — never hardcoded in tests.
const EP = createClient(config).getConfig().ollamaEndpoints[0];

jest.setTimeout(30000);

async function checkEndpoint() {
  try {
    const res = await fetch(`${EP}/v1/models`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e: any) {
    throw new Error(`Ollama unreachable at ${EP}: ${e.message}`);
  }
}

describe('createAuthMiddleware', () => {
  test('injectAuthHeaders adds Bearer token when present', () => {
    const mw = createAuthMiddleware({ getToken: () => 'tok-123' });
    const h = mw.injectAuthHeaders({ 'Content-Type': 'application/json' });
    expect(h.Authorization).toBe('Bearer tok-123');
    expect(h['Content-Type']).toBe('application/json');
  });

  test('injectAuthHeaders leaves headers unchanged when no token', () => {
    const mw = createAuthMiddleware({ getToken: () => null });
    const h = mw.injectAuthHeaders({ 'Content-Type': 'application/json' });
    expect(h.Authorization).toBeUndefined();
  });

  test('withAuth makes a real request to the Ollama endpoint with token injected', async () => {
    await checkEndpoint();
    const mw = createAuthMiddleware({ getToken: () => 'tok-abc' });
    const res = await mw.withAuth(`${EP}/v1/models`);
    expect(res.ok).toBe(true);
  });
});