/**
 * Triple Validation Benchmark
 *
 * Benchmarks available Ollama models on a personal-knowledge-graph triple
 * validation task. Test cases (utterance + candidate triple + expected
 * validity) are loaded from the `TestCase` ES entity (index
 * `sample-prompt-test-case` by default). Each model is asked to answer
 * True/False using TRIPLE_VALIDATION_PROMPT, then scored per model:
 *   correct / wrong / false positives / false negatives — matching the
 * Python benchmark loop (valid cases → FN on miss, invalid cases → FP on miss).
 *
 * TestCase storage convention:
 *   input           → utterance the user spoke
 *   expected_output → candidate triple, e.g. "(user, schema:favoriteColor, green)"
 *   notes           → "valid" | "invalid"  (expected model answer)
 */

import { chatCompletionWithUsage } from './openai-fetch';
import { ensureEsIndex, getEsConfig } from './es-entities';
import { telemetry } from './telemetry';
import { TelemetryEvents } from './telemetry-events';

export const TRIPLE_VALIDATION_PROMPT = `You are a triple validator for a personal knowledge graph.

Given an utterance that a user spoke to a voice assistant and a candidate triple, your task is to validate the triple

Utterances about the user usually have the form of "I am ...." or "My ..."

Utterances about the assistant usually have the form of "You are ...." or "Your ..."

Knowledge about the broader world should be discarded, you are only interested in personal information about the user or the voice assistant

Each triple is in the format:
(subject, predicate, object)

Only return 'True' if:
- The subject is 'self' (the assistant) or 'user' (the user)
- The triple is about user or assistant personal information
- The triple is factually plausible and makes sense
- The triple DOES NOT contradict the utterance

Otherwise, return 'False'.

Examples of valid triples:
"my favorite color is green" - ("user", "schema:favoriteColor", "green")
"your favorite color is blue" - ("self", "schema:favoriteColor", "blue")

Examples of invalid triples:
"my favorite color is green" - ("user", "schema:favoriteColor", "red")
"I love the color green" - ("self", "schema:favoriteColor", "green")
"your favorite color is blue" - ("user", "schema:favoriteColor", "blue")

YOU MUST answer with only one word: True or False.

The user said: "{utterance}"

Candidate triple: {triple}
`;

// In-memory cache: the last benchmark report is reused until the model set
// (or test-case count / options) changes, so repeated calls skip the
// expensive per-model benchmark.
let _cache: { key: string; report: TripleValidationReport } | null = null;

/** Invalidate the cached benchmark report (forces a fresh run next call). */
export function clearTripleValidationCache(): void {
  _cache = null;
}

function cacheKey(
  models: string[],
  caseCount: number,
  opts: { testCaseIndex?: string; includePerCase?: boolean; caseLimit?: number },
): string {
  return JSON.stringify({
    m: [...models].sort(),
    tc: caseCount,
    idx: opts.testCaseIndex || '',
    pc: !!opts.includePerCase,
    cl: opts.caseLimit ?? 0,
    ml: 0,
  });
}

export interface TripleTestCase {
  id: string;
  utterance: string;
  triple: string;
  expectedValid: boolean;
}

export interface CaseResult {
  utterance: string;
  triple: string;
  expected: boolean;
  actual: boolean | null;
  passed: boolean;
  raw: string;
}

export interface ModelScore {
  model: string;
  endpoint: string;
  correct: number;
  wrong: number;
  /** Model answered True on an invalid case. */
  falsePositives: number;
  /** Model answered False on a valid case. */
  falseNegatives: number;
  errors: number;
  total: number;
  /** correct / total (0 when no cases). */
  accuracy: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  perCase?: CaseResult[];
}

export interface TripleValidationReport {
  models: ModelScore[];
  testCaseCount: number;
  validCount: number;
  invalidCount: number;
  endpoint: string;
  created_date: string;
}

/** Resolve the ES index holding TestCase records (config map → prefix-based default). */
function resolveTestCaseIndex(override?: string): string {
  if (override) return override;
  const cfg = getEsConfig();
  return cfg.indices?.TestCase || `${cfg.indexPrefix}-test-case`;
}

/** List every model available on the endpoint, sorted by size (smallest first). */
async function listAvailableModels(ollamaEndpoints: string[], defaultModel: string): Promise<string[]> {
  const ep = (ollamaEndpoints.find((e) => !!e) || 'http://127.0.0.1:11434').replace(/\/$/, '');
  try {
    // Ollama native API returns model details including `size`.
    const res = await fetch(`${ep}/api/models`);
    if (res.ok) {
      const data: any = await res.json();
      const models: { id: string; size: number }[] = (data.models || [])
        .map((m: any) => ({ id: m.name || m.model, size: m.size || 0 }))
        .filter((m: { id: string }) => !!m.id);
      if (models.length) {
        models.sort((a, b) => a.size - b.size);
        return models.map((m) => m.id);
      }
    }
    // Fallback to OpenAI-compatible endpoint (no size info — keep original order).
    const res2 = await fetch(`${ep}/v1/models`);
    if (res2.ok) {
      const data: any = await res2.json();
      const ids: string[] = (data.data || []).map((m: any) => m.id).filter(Boolean);
      if (ids.length) return ids;
    }
    return defaultModel ? [defaultModel] : [];
  } catch {
    return defaultModel ? [defaultModel] : [];
  }
}

/** Load + normalise test cases from the TestCase ES index. */
async function loadTestCases(index: string, limit?: number): Promise<TripleTestCase[]> {
  const cfg = getEsConfig();
  try {
    const res = await fetch(`${cfg.endpoint}/${index}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match_all: {} }, size: limit ?? 500 }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.hits?.hits || [])
      .map((h: any) => {
        const src = h._source || {};
        // Support both field conventions:
        //   1. TestCase entity schema: input / expected_output / notes("valid"|"invalid")
        //   2. Raw imported test-case.json: utterance / triple(array) / is_valid(boolean)
        const utterance = String(src.input || src.utterance || '').trim();
        const rawTriple = src.expected_output ?? src.triple;
        const triple = Array.isArray(rawTriple)
          ? `(${rawTriple.map((p: any) => String(p)).join(', ')})`
          : String(rawTriple || '').trim();
        let expectedValid: boolean;
        if (typeof src.is_valid === 'boolean') {
          expectedValid = src.is_valid;
        } else {
          const notes = String(src.notes || '').toLowerCase();
          expectedValid = notes.includes('invalid') ? false : true;
        }
        return { id: h._id, utterance, triple, expectedValid };
      })
      .filter((t: TripleTestCase) => t.utterance && t.triple);
  } catch {
    return [];
  }
}

function buildPrompt(utterance: string, triple: string): string {
  return TRIPLE_VALIDATION_PROMPT
    .replace(/\{utterance\}/g, utterance)
    .replace(/\{triple\}/g, triple);
}

/** Parse a one-word True/False verdict, tolerant of punctuation / extra text. */
function parseVerdict(raw: string): boolean | null {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (/^(true|yes|valid)\b/.test(t)) return true;
  if (/^(false|no|invalid)\b/.test(t)) return false;
  if (t.includes('true')) return true;
  if (t.includes('false')) return false;
  return null;
}

async function validateOne(
  ollamaEndpoints: string[],
  model: string,
  tc: TripleTestCase,
  signal?: AbortSignal,
): Promise<{ predicted: boolean | null; raw: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null; ms: number }> {
  try {
    const prompt = buildPrompt(tc.utterance, tc.triple);
    const start = Date.now();
    const { content, usage } = await chatCompletionWithUsage(
      ollamaEndpoints,
      model,
      [{ role: 'user', content: prompt }],
      { temperature: 0, max_tokens: 5, signal },
    );
    const ms = Date.now() - start;
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return { predicted: parseVerdict(text), raw: text, usage, ms };
  } catch (err: any) {
    return { predicted: null, raw: err?.message ?? String(err), usage: null, ms: 0 };
  }
}

/** Run async tasks with a bounded concurrency pool. */
async function pooledMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Benchmark available models on the triple-validation task.
 *
 * @param ollamaEndpoints  Active Ollama endpoints.
 * @param defaultModel     Fallback model when /v1/models is unreachable.
 * @param opts.models      Restrict to a specific model list (default: all from /v1/models).
 * @param opts.testCaseIndex  Override the ES index holding test cases.
 * @param opts.includePerCase  Attach per-case predictions to each model score.
 */
export async function tripleValidation(
  ollamaEndpoints: string[],
  defaultModel: string,
  opts: { models?: string[]; testCaseIndex?: string; signal?: AbortSignal; includePerCase?: boolean; caseLimit?: number; modelLimit?: number } = {},
): Promise<TripleValidationReport> {
  const cases = await loadTestCases(resolveTestCaseIndex(opts.testCaseIndex), opts.caseLimit);
  const valid = cases.filter((c) => c.expectedValid);
  const invalid = cases.filter((c) => !c.expectedValid);
  const models = opts.models?.length
    ? opts.models
    : await listAvailableModels(ollamaEndpoints, defaultModel);

  // Serve the cached report when the model set (and options) are unchanged.
  const key = cacheKey(models, cases.length, opts);
  if (_cache && _cache.key === key) return _cache.report;

  telemetry.emit(TelemetryEvents.TRIPLE_VALIDATION_START, {
    modelCount: models.length,
    caseCount: cases.length,
    validCount: valid.length,
    invalidCount: invalid.length,
  });

  const totalCases = valid.length + invalid.length;
  let globalDone = 0;
  const scores: ModelScore[] = [];
  const modelStartTimes: Record<string, number> = {};
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    let correct = 0;
    let wrong = 0;
    let fp = 0;
    let fn = 0;
    let errors = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let durationMs = 0;
    const perCase: CaseResult[] = [];

    const emitProgress = (modelDone: number) => {
      telemetry.emit(TelemetryEvents.TRIPLE_VALIDATION_PROGRESS, {
        modelIndex: mi + 1,
        modelCount: models.length,
        model,
        done: modelDone,
        total: totalCases,
        globalDone,
        globalTotal: totalCases * models.length,
      });
    };

    // Reset per-model counter — progress bar starts from 0 for each model.
    let modelDone = 0;
    const modelStart = Date.now();

    const recordResult = (
      expected: boolean,
      predicted: boolean | null,
      raw: string,
      tc: TripleTestCase,
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null,
      ms: number,
    ) => {
      if (opts.includePerCase) perCase.push({ utterance: tc.utterance, triple: tc.triple, expected, actual: predicted, passed: predicted !== null && predicted === expected, raw });
      if (predicted === null) errors++;
      else if (expected ? predicted : !predicted) correct++;
      else { wrong++; expected ? fn++ : fp++; }
      if (usage) {
        promptTokens += usage.prompt_tokens;
        completionTokens += usage.completion_tokens;
        totalTokens += usage.total_tokens;
      }
      durationMs += ms;
      modelDone++;
      globalDone++;
      emitProgress(modelDone);
    };

    // Process valid + invalid cases concurrently (bounded pool) for speed.
    const allCases: { tc: TripleTestCase; expected: boolean }[] = [
      ...valid.map((tc) => ({ tc, expected: true })),
      ...invalid.map((tc) => ({ tc, expected: false })),
    ];
    await pooledMap(allCases, 6, async ({ tc, expected }) => {
      const { predicted, raw, usage, ms } = await validateOne(ollamaEndpoints, model, tc, opts.signal);
      recordResult(expected, predicted, raw, tc, usage, ms);
    }, opts.signal);

    const total = valid.length + invalid.length;
    scores.push({
      model,
      endpoint: (ollamaEndpoints.find((e) => !!e) || '').replace(/\/$/, ''),
      correct,
      wrong,
      falsePositives: fp,
      falseNegatives: fn,
      errors,
      total,
      accuracy: total ? correct / total : 0,
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs,
      ...(opts.includePerCase ? { perCase } : {}),
    });
    modelStartTimes[model] = modelStart;
  }

  const report: TripleValidationReport = {
    models: scores,
    testCaseCount: cases.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    endpoint: (ollamaEndpoints.find((e) => !!e) || '').replace(/\/$/, ''),
    created_date: new Date().toISOString(),
  };

  _cache = { key, report };

  // Persist each model's score as a TestResult ES record for drift comparison.
  if (!opts.signal?.aborted) {
    try {
      await storeTestResults(scores, ollamaEndpoints, report.testCaseCount);
    } catch (e) {
      telemetry.emit(TelemetryEvents.TRIPLE_VALIDATION_COMPLETE, {
        error: 'Failed to store test results: ' + (e as any)?.message,
      });
    }
  }

  telemetry.emit(TelemetryEvents.TRIPLE_VALIDATION_COMPLETE, {
    modelCount: models.length,
    bestModel: scores.sort((a, b) => b.accuracy - a.accuracy)[0]?.model ?? null,
  });

  return report;
}

/** Resolve the ES index for TestResult records. */
function resolveTestResultIndex(): string {
  const cfg = getEsConfig();
  return cfg.indices?.TestResult || `${cfg.indexPrefix}-test-result`;
}

/** ES mappings for the test-result index. */
const TEST_RESULT_MAPPINGS = {
  mappings: {
    properties: {
      created_date:           { type: 'date' },
      updated_date:           { type: 'date' },
      session_name:           { type: 'text', fields: { keyword: { type: 'keyword' } } },
      model_name:             { type: 'keyword' },
      provider:               { type: 'keyword' },
      endpoint:               { type: 'keyword' },
      score:                  { type: 'float' },
      correct:                { type: 'integer' },
      wrong:                  { type: 'integer' },
      false_positives:        { type: 'integer' },
      false_negatives:        { type: 'integer' },
      duration_seconds:       { type: 'float' },
      time_per_query:         { type: 'float' },
      performance_score:      { type: 'float' },
      energy_efficiency:      { type: 'float' },
      model_size_mb:          { type: 'float' },
      total_tokens:           { type: 'integer' },
      prompt_tokens:          { type: 'integer' },
      completion_tokens:      { type: 'integer' },
      estimated_cost_usd:     { type: 'float' },
      error_count:            { type: 'integer' },
      last_error:             { type: 'text' },
      status:                 { type: 'keyword' },
      is_archived:            { type: 'boolean' },
      drift_ratio:            { type: 'float' },
      drift_percentage:       { type: 'float' },
      gdpr_compliant:         { type: 'boolean' },
      test_results:           { type: 'object', enabled: false },
      capabilities:           { type: 'object', enabled: false },
    },
  },
};

/** Estimate model size in MB from Ollama /api/models. */
async function fetchModelSizeMb(ollamaEndpoints: string[], model: string): Promise<number> {
  const ep = (ollamaEndpoints.find((e) => !!e) || 'http://127.0.0.1:11434').replace(/\/$/, '');
  try {
    const res = await fetch(`${ep}/api/models`);
    if (!res.ok) return 0;
    const data: any = await res.json();
    const found = (data.models || []).find((m: any) => (m.name || m.model) === model);
    if (found?.size) return Math.round((found.size / (1024 * 1024)) * 10) / 10;
    return 0;
  } catch {
    return 0;
  }
}

/** Sanitise a model name into a stable ES document ID (one doc per model). */
function docIdForModel(modelName: string): string {
  return modelName.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Fetch the most recent completed TestResult for a model to compute drift. */
async function fetchPreviousResult(
  index: string,
  modelName: string,
): Promise<{ accuracy: number; total: number; totalTokens: number } | null> {
  const cfg = getEsConfig();
  try {
    const res = await fetch(`${cfg.endpoint}/${index}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size: 1,
        query: {
          bool: {
            must: [
              { term: { model_name: modelName } },
              { term: { status: 'completed' } },
              { term: { is_archived: false } },
            ],
          },
        },
        sort: [{ created_date: 'desc' }],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const hit = data.hits?.hits?.[0]?._source;
    if (!hit) return null;
    return {
      accuracy: hit.score ?? 0,
      total: hit.correct + hit.wrong,
      totalTokens: hit.total_tokens ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Store each model's benchmark score as a TestResult ES record.
 * Computes drift by comparing against the previous run for the same model.
 */
async function storeTestResults(
  scores: ModelScore[],
  ollamaEndpoints: string[],
  testCaseCount: number,
): Promise<void> {
  const cfg = getEsConfig();
  const index = resolveTestResultIndex();
  await ensureEsIndex(cfg.endpoint, index, TEST_RESULT_MAPPINGS);

  const sessionName = `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const endpoint = (ollamaEndpoints.find((e) => !!e) || '').replace(/\/$/, '');

  for (const s of scores) {
    const previous = await fetchPreviousResult(index, s.model);
    const modelSizeMb = await fetchModelSizeMb(ollamaEndpoints, s.model);

    // Drift: difference in accuracy vs the previous run (0 if no prior run).
    const driftRatio = previous && previous.total > 0
      ? (previous.accuracy - s.accuracy)
      : 0;

    const durationSeconds = s.durationMs / 1000;
    const timePerQuery = s.total ? durationSeconds / s.total : 0;

    // Performance score: accuracy weighted by speed (queries/sec), 0–100 scale.
    const queriesPerSec = durationSeconds > 0 ? s.total / durationSeconds : 0;
    const performanceScore = Math.round((s.accuracy * 70 + Math.min(queriesPerSec, 10) * 3) * 10) / 10;

    // Energy efficiency: correct answers per 1k tokens consumed (higher = better).
    // Wrong answers consumed tokens but produced no useful result, so only
    // correct answers count toward useful work done per unit of energy.
    const energyEfficiency = s.totalTokens > 0
      ? Math.round((s.correct / (s.totalTokens / 1000)) * 100) / 100
      : 0;

    // Local Ollama = GDPR compliant (data never leaves infrastructure).
    const isLocal = endpoint.includes('127.0.0.1') || endpoint.includes('localhost') || endpoint.includes('192.168.') || endpoint.includes('/proxy');
    const gdprCompliant = isLocal;

    // Estimated cost: $0 for local, rough $0.002/1k tokens for cloud.
    const estimatedCostUsd = gdprCompliant
      ? 0
      : Math.round(((s.promptTokens * 0.0000015) + (s.completionTokens * 0.000002)) * 10000) / 10000;

    let overallRating = 'needs-improvement';
    if (s.accuracy >= 0.95) overallRating = 'excellent';
    else if (s.accuracy >= 0.85) overallRating = 'good';
    else if (s.accuracy >= 0.7) overallRating = 'fair';

    const capabilities = {
      strengths: s.falseNegatives === 0 ? ['No false negatives on valid triples'] : [],
      weaknesses: s.errors > 0 ? [`${s.errors} unparseable responses`] : [],
      best_use_cases: overallRating === 'excellent'
        ? ['Production triple validation', 'Personal knowledge graph curation']
        : [],
      performance_profile: `${(s.accuracy * 100).toFixed(1)}% accuracy at ${queriesPerSec.toFixed(1)} q/s`,
      deployment_recommendation: gdprCompliant
        ? 'Local deployment — suitable for GDPR-sensitive data'
        : 'Cloud provider — ensure data processing agreements are in place',
      overall_rating: overallRating,
    };

    const doc = {
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
      session_name: sessionName,
      model_name: s.model,
      provider: gdprCompliant ? 'ollama' : 'cloud',
      endpoint,
      score: Math.round(s.accuracy * 10000) / 10000,
      correct: s.correct,
      wrong: s.wrong,
      false_positives: s.falsePositives,
      false_negatives: s.falseNegatives,
      duration_seconds: Math.round(durationSeconds * 100) / 100,
      time_per_query: Math.round(timePerQuery * 1000) / 1000,
      performance_score: performanceScore,
      energy_efficiency: energyEfficiency,
      model_size_mb: modelSizeMb,
      total_tokens: s.totalTokens,
      prompt_tokens: s.promptTokens,
      completion_tokens: s.completionTokens,
      estimated_cost_usd: estimatedCostUsd,
      error_count: s.errors,
      last_error: s.errors > 0 && s.perCase ? (s.perCase.find((c) => c.actual === null)?.raw || '') : '',
      status: 'completed',
      is_archived: false,
      drift_ratio: Math.round(driftRatio * 10000) / 10000,
      drift_percentage: Math.round(driftRatio * 10000) / 100,
      gdpr_compliant: gdprCompliant,
      test_results: s.perCase || [],
      capabilities,
    };

    try {
      // Existence check: one HEAD per model. If the doc already exists we
      // update it in place (PUT) instead of inserting a second record — the
      // drift was already computed above from fetchPreviousResult().
      const docId = docIdForModel(s.model);
      const existsRes = await fetch(`${cfg.endpoint}/${index}/_doc/${docId}`, { method: 'HEAD' });
      const exists = existsRes.status === 200;
      // PUT acts as upsert: creates if absent, updates in place if present.
      // Drift (doc.drift_percentage) was computed from fetchPreviousResult above.
      await fetch(`${cfg.endpoint}/${index}/_doc/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
    } catch (e) {
      // Non-fatal — benchmark result still returned to caller.
    }
  }
}
