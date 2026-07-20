/**
 * client.integration.test.ts
 *
 * Jest integration test suite — wraps all suites from client.test.ts
 * and runs them against real endpoints (Ollama @ 127.0.0.1:11434, ES @ 127.0.0.1:9200).
 * No fetch mocks — every test hits a live service.
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

// Increase timeout for real network calls (30 s per test, 120 s for suite C)
jest.setTimeout(120_000);

// ── Shared failure collector — aggregated across all suites ──────────────────
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

// ── Top-level afterAll — prints the consolidated fail summary ────────────────
afterAll(() => {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  📊 TEST SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  ✅ Passed:  ${stats.passed}`);
  console.log(`  ❌ Failed:  ${stats.failed}`);
  console.log(`  ⏭️  Skipped: ${stats.skipped}`);
  console.log(`  📁 Total:    ${stats.passed + stats.failed + stats.skipped}`);
  console.log('══════════════════════════════════════════════════════════════════');
  if (failures.length > 0) {
    console.log('\n  ❌ FAIL DETAILS');
    console.log('  ────────────────');
    failures.forEach((f, i) => {
      console.log(`\n  ${i + 1}. [${f.suite}] ${f.name}`);
      if (f.error) console.log(`     Error: ${f.error}`);
    });
    console.log('\n══════════════════════════════════════════════════════════════════\n');
  } else {
    console.log('\n  ✅ ALL TESTS PASSED\n');
  }
});

// ── Helper: skip a suite when the endpoint is unreachable ───────────────────

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
    const res = await fetch('http://127.0.0.1:9200/_cluster/health', { signal: AbortSignal.timeout(5000) });
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
  });

  for (const testFn of SUITE_A) {
    it(testFn.name, async () => {
      if (!ollamaUp) { stats.skipped++; return; }
      const result = await testFn();
      result.output.forEach((l) => console.log(' ', l));
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite A', result);
      expect(result.pass).toBe(true);
    });
  }
});

// ── Suite B — Client Infrastructure (no network required) ───────────────────

describe('Suite B — Client Infrastructure', () => {
  for (const testFn of SUITE_B) {
    it(testFn.name, async () => {
      const result = await testFn();
      result.output.forEach((l) => console.log(' ', l));
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite B', result);
      expect(result.pass).toBe(true);
    });
  }
});

// ── Suite C — Endpoints & ES Entities ───────────────────────────────────────

describe('Suite C — Endpoints & ES Entities', () => {
  let ollamaUp: boolean;
  let esUp: boolean;

  beforeAll(async () => {
    [ollamaUp, esUp] = await Promise.all([isOllamaReachable(), isEsReachable()]);
  });

  for (const testFn of SUITE_C) {
    it(testFn.name, async () => {
      const needsEs = /C[3-9]|C1[0-6]/.test(testFn.name);
      const needsOllama = /C1[7-9]|C2[0-9]/.test(testFn.name);

      if (needsEs && !esUp) { stats.skipped++; return; }
      if (needsOllama && !ollamaUp) { stats.skipped++; return; }

      const result = await testFn();
      result.output.forEach((l) => console.log(' ', l));
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite C', result);
      expect(result.pass).toBe(true);
    });
  }
});

// ── Suite D — New Feature Modules (cost estimator, memory, A/B, jobs, versions, failover) ──

describe('Suite D — New Feature Modules', () => {
  let ollamaUp: boolean;
  let esUp: boolean;

  beforeAll(async () => {
    [ollamaUp, esUp] = await Promise.all([isOllamaReachable(), isEsReachable()]);
  });

  for (const testFn of SUITE_D) {
    it(testFn.name, async () => {
      // D1 = pure logic, D3 = ES only, D4-D6 = both
      const needsOllama = /D[456]|D4/.test(testFn.name);
      const needsEs = /D[23456]/.test(testFn.name);

      if (needsEs && !esUp) { stats.skipped++; return; }
      if (needsOllama && !ollamaUp) { stats.skipped++; return; }

      const result = await testFn();
      result.output.forEach((l) => console.log(' ', l));
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite D', result);
      expect(result.pass).toBe(true);
    });
  }
});

// ── Suite E — Ground Check & openai-fetch ────────────────────────────────────

describe('Suite E — Ground Check & openai-fetch', () => {
  let ollamaUp: boolean;

  beforeAll(async () => {
    ollamaUp = await isOllamaReachable();
  });

  for (const testFn of SUITE_E) {
    it(testFn.name, async () => {
      if (!ollamaUp) { stats.skipped++; return; }
      const result = await testFn();
      result.output.forEach((l) => console.log(' ', l));
      if (result.error) console.error('  Error:', result.error);
      recordFailure('Suite E', result);
      expect(result.pass).toBe(true);
    });
  }
});