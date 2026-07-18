/**
 * Benchmark Score Loader
 *
 * Reads the most recent TestResult records from Elasticsearch (written by
 * triple-validation.ts) and exposes them to the model router so routing
 * decisions can use real measured performance instead of just param count.
 *
 * Cache hierarchy:
 *   1. In-memory map         — instant, per-session
 *   2. localStorage           — instant, per-browser
 *   3. Elasticsearch index    — one network call, shared across ALL clients
 *
 * The benchmark data is best-effort: if ES is unreachable or no benchmarks
 * have been run yet, callers get an empty map and fall back to param-count
 * routing (the existing behaviour).
 */

import { getEsConfig } from './es-entities';

const BENCH_LS_KEY = 'model_router_benchmark_cache';
const BENCH_TTL_MS = 5 * 60 * 1000; // 5 minutes — benchmark data is not time-critical

export interface BenchmarkScore {
  model: string;
  accuracy: number;        // 0–1
  correct: number;
  wrong: number;
  total: number;
  totalTokens: number;
  durationMs: number;
  energyEfficiency: number; // correct answers per 1k tokens
  performanceScore: number; // 0–100
  errors: number;
  modelSizeMb: number;
  driftRatio: number;
  estimatedCostUsd: number;
  gdprCompliant: boolean;
  createdDate: string;
}

type BenchmarkMap = Record<string, BenchmarkScore>;

let _benchCache: BenchmarkMap | null = null;
let _benchTs = 0;

function loadFromStorage(): BenchmarkMap | null {
  try {
    const raw = typeof globalThis.localStorage !== 'undefined'
      ? globalThis.localStorage.getItem(BENCH_LS_KEY)
      : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { map: BenchmarkMap; ts: number };
    if (!parsed.map || !parsed.ts) return null;
    return parsed.map;
  } catch { return null; }
}

function saveToStorage(map: BenchmarkMap) {
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(BENCH_LS_KEY, JSON.stringify({ map, ts: Date.now() }));
    }
  } catch {}
}

/** Resolve the ES index for TestResult records (mirrors triple-validation.ts). */
function resolveTestResultIndex(): string {
  const cfg = getEsConfig();
  return cfg.indices?.TestResult || `${cfg.indexPrefix}-test-result`;
}

/**
 * Fetch the latest completed TestResult per model from Elasticsearch.
 * Returns a map keyed by model_name.
 */
async function fetchFromEs(): Promise<BenchmarkMap | null> {
  try {
    const cfg = getEsConfig();
    const index = resolveTestResultIndex();
    // Use a terms aggregation grouped by model_name, with a top_hits sub-aggregation
    // to get the most recent record per model in a single query.
    const body = {
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { status: 'completed' } },
            { term: { is_archived: false } },
          ],
        },
      },
      aggs: {
        by_model: {
          terms: { field: 'model_name', size: 100 },
          aggs: {
            latest: {
              top_hits: {
                sort: [{ created_date: 'desc' }],
                size: 1,
                _source: [
                  'model_name', 'score', 'correct', 'wrong', 'false_positives',
                  'false_negatives', 'total_tokens', 'prompt_tokens', 'completion_tokens',
                  'duration_seconds', 'energy_efficiency', 'performance_score',
                  'model_size_mb', 'error_count', 'drift_ratio', 'estimated_cost_usd',
                  'gdpr_compliant', 'created_date',
                ],
              },
            },
          },
        },
      },
    };

    const res = await fetch(`${cfg.endpoint}/${index}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const buckets = data.aggregations?.by_model?.buckets || [];
    const map: BenchmarkMap = {};
    for (const bucket of buckets) {
      const hit = bucket.latest?.hits?.hits?.[0]?._source;
      if (!hit) continue;
      const correct = hit.correct ?? 0;
      const wrong = hit.wrong ?? 0;
      const total = correct + wrong;
      map[bucket.key] = {
        model: hit.model_name ?? bucket.key,
        accuracy: hit.score ?? (total ? correct / total : 0),
        correct,
        wrong,
        total,
        totalTokens: hit.total_tokens ?? 0,
        durationMs: Math.round((hit.duration_seconds ?? 0) * 1000),
        energyEfficiency: hit.energy_efficiency ?? 0,
        performanceScore: hit.performance_score ?? 0,
        errors: hit.error_count ?? 0,
        modelSizeMb: hit.model_size_mb ?? 0,
        driftRatio: hit.drift_ratio ?? 0,
        estimatedCostUsd: hit.estimated_cost_usd ?? 0,
        gdprCompliant: hit.gdpr_compliant ?? false,
        createdDate: hit.created_date ?? '',
      };
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Get the benchmark map synchronously from memory or localStorage.
 * If the cache is stale or missing, kicks off an async ES fetch
 * (non-blocking) so the next call has fresh data.
 */
export function getBenchmarkScores(): BenchmarkMap {
  // Memory hit
  if (_benchCache && (Date.now() - _benchTs) < BENCH_TTL_MS) {
    return _benchCache;
  }

  // localStorage hit
  const stored = loadFromStorage();
  if (stored && Object.keys(stored).length > 0) {
    _benchCache = stored;
    _benchTs = Date.now();
    // Async refresh if stale
    if ((Date.now() - _benchTs) >= BENCH_TTL_MS) {
      refreshBenchmarkCache();
    }
    return _benchCache;
  }

  // Cache miss — kick off async fetch (non-blocking)
  refreshBenchmarkCache();
  return _benchCache ?? {};
}

/** Async refresh of the benchmark cache from ES (deduplicated). */
let _refreshPromise: Promise<void> | null = null;
export function refreshBenchmarkCache(): Promise<void> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = fetchFromEs()
    .then((map) => {
      if (map && Object.keys(map).length > 0) {
        _benchCache = map;
        _benchTs = Date.now();
        saveToStorage(map);
      }
    })
    .catch(() => {})
    .finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

/** Invalidate the in-memory + localStorage benchmark cache. */
export function invalidateBenchmarkCache(): void {
  _benchCache = null;
  _benchTs = 0;
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem(BENCH_LS_KEY);
    }
  } catch {}
}