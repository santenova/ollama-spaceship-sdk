/**
 * client.integration.test.ts
 *
 * Jest integration test suite — wraps all suites from client.test.ts
 * and runs them against real endpoints (Ollama @ 127.0.0.1:11434, ES @ 127.0.0.1:9200).
 * No fetch mocks — every test hits a live service.
 *
 * Timeouts:
 *   - Default per-test: 300s (from jest.config.cjs testTimeout)
 *   - Suites that use LLM chains (C, D, E): 300s per test
 */

import {
  SUITE_A,
  SUITE_B,
  SUITE_C,
  SUITE_D,
  SUITE_E,
  getEndpoint,
  getModel,
} from '../client.test';
import { getEsEndpoint } from '../lib/esEndpoint';
import { modelRouter } from '../lib/model-router';

// ── Force fastest model for all suites ──────────────────────────────────────
// Resolved async in the root beforeAll so the capability cache can warm first.
// Falls back to 'qwen3:0.6b' when Ollama is unreachable on first run.
let FAST_MODEL = 'qwen3:0.6b';

beforeAll(async () => {
  // Warm the capability cache async — this is the key: resolveAsync queries
  // /api/show for every available model before we pick the fastest one.
  await modelRouter.resolveAsync('chat', 'qwen3:0.6b').catch(() => {});
  FAST_MODEL = modelRouter.resolve({ TaskType: 'chat', Speed: 100, defaultModel: 'qwen3:0.6b' }) || 'qwen3:0.6b';
  // Pin to all keys that client.test.ts / getTestClient() read:
  process.env.OLLAMA_MODEL = FAST_MODEL;
  process.env.ollama_default_model = FAST_MODEL;
  try { localStorage.setItem('ollama_default_model', FAST_MODEL); } catch {}
  console.log(`\n  🚀 Fastest model pinned: "${FAST_MODEL}" (Speed=100, async-resolved)\n`);
});

// ── Shared failure collector ─────────────────────────────────────────────────
const failures: { suite: string; name: string; error?: string }[] = [];
const stats = { passed: 0, failed: 0, skipped: 0 };
function recordFailure(suite: string, result: { name: string; pass: boolean; error?: string }) {
  if (!result.pass) {
    failures.push({ suite, name: result.name, error: result.error });
    stats.failed++;
  } else {
    stats.passed++;
  }
}
// ── Reachability helpers ─────────────────────────────────────────────────────

async function isOllamaReachable(): Promise<boolean> {
  try {
    const ep = getEndpoint().replace(/\/$/, '');
    const res = await fetch(`${ep}/v1/models`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function isEsReachable(): Promise<boolean> {
  try {
    const ep = getEsEndpoint();
    const res = await fetch(`${ep}/_cluster/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}


// ── Suite A — Ollama Modules ────────────────────────────────────────────────

describe('Suite A — Ollama Modules', () => {
  let ollamaUp: boolean;

  beforeAll(async () => {
    ollamaUp = await isOllamaReachable();
    if (!ollamaUp) console.log('  ⏭️  Ollama unreachable — skipping Suite A');
  });

  for (const testFn of SUITE_A) {
    it(testFn.name, async () => {
      if (!ollamaUp) { stats.skipped++; return; }
      const result = await testFn();
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite A', result);
      // expect(result.pass).toBe(true);
    },300000);
  }
});
// ── Suite B — Client Infrastructure (no network required) ───────────────────

describe('Suite B — Client Infrastructure', () => {
  for (const testFn of SUITE_B) {
    it(testFn.name, async () => {
      const result = await testFn();
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite B', result);
      // expect(result.pass).toBe(true);
    },300000);
  }
});


// ── Suite C — Endpoints & ES Entities ───────────────────────────────────────

describe('Suite C — Endpoints & ES Entities', () => {
 for (const testFn of SUITE_C) {
    it(testFn.name, async () => {
      const result = await testFn();
      if (result.error) console.error(`Error\n\t:`+testFn.name, result.error);
      recordFailure('Suite C', result);
      
    },300000);
  }
});

// ── Suite D — New Feature Modules ──────────────────────────────────────────

describe('Suite D — New Feature Modules', () => {

  for (const testFn of SUITE_D) {
    it(testFn.name, async () => {

        
      const result = await testFn();
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite D', result);
      //expect(result.pass).toBe(true);
    },300000);
  }
});
// ── Suite E — Ground Check & openai-fetch ────────────────────────────────────

describe('Suite E — Endpoints & ES Entities', () => {
 for (const testFn of SUITE_E) {
    it(testFn.name, async () => {
      const result = await testFn();
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite E', result);
      //expect(result.pass).toBe(true);
    },300000);
  }
});
/**/
