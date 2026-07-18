/**
 * Prompt A/B Testing Framework
 *
 * Sends multiple prompt variants to the LLM via /v1/chat/completions,
 * scores each response via an LLM judge, and persists results to ES.
 */

import { chatCompletion } from './openai-fetch';
import { getEsConfig, ensureEsIndex } from './es-entities';
import { telemetry } from './telemetry';

const ABTEST_INDEX = 'sample-prompt-abtest';
const DEFAULT_METRICS = ['clarity', 'accuracy', 'helpfulness'];

export interface ABVariant {
  label: string;
  prompt: string;
  system?: string;
  model?: string;
}

export interface ABMetricScore {
  metric: string;
  score: number;
  reasoning: string;
}

export interface ABVariantResult {
  label: string;
  prompt: string;
  response: string;
  scores: ABMetricScore[];
  totalScore: number;
  durationMs: number;
  error?: string;
}

export interface ABTestResult {
  id?: string;
  variants: ABVariant[];
  metrics: string[];
  results: ABVariantResult[];
  winner: string | null;
  created_date: string;
}

async function runVariant(
  variant: ABVariant,
  ollamaEndpoints: string[],
  defaultModel: string,
  signal?: AbortSignal,
): Promise<{ response: string; durationMs: number; error?: string }> {
  const start = Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  if (variant.system) messages.push({ role: 'system', content: variant.system });
  messages.push({ role: 'user', content: variant.prompt });

  try {
    const response = await chatCompletion(ollamaEndpoints, variant.model || defaultModel, messages, { signal });
    return { response: typeof response === 'string' ? response : JSON.stringify(response), durationMs: Date.now() - start };
  } catch (err: any) {
    return { response: '', durationMs: Date.now() - start, error: err?.message ?? String(err) };
  }
}

async function judgeResponse(
  prompt: string,
  response: string,
  metrics: string[],
  ollamaEndpoints: string[],
  defaultModel: string,
): Promise<ABMetricScore[]> {
  const schema = {
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            metric:    { type: 'string' },
            score:     { type: 'number' },
            reasoning: { type: 'string' },
          },
          required: ['metric', 'score', 'reasoning'],
        },
      },
    },
    required: ['scores'],
  };

  const judgePrompt = `You are an objective AI response evaluator.

Original prompt: "${prompt.slice(0, 500)}"

AI response to evaluate:
"""
${response.slice(0, 1000)}
"""

Score the response on these metrics: ${metrics.join(', ')}.
Each metric: score 1-10 (10 = best) and a one-sentence reasoning.`;

  try {
    const result = await chatCompletion(
      ollamaEndpoints,
      defaultModel,
      [{ role: 'user', content: judgePrompt }],
      { response_json_schema: schema },
    );
    return Array.isArray(result?.scores) ? result.scores : [];
  } catch {
    return metrics.map(m => ({ metric: m, score: 5, reasoning: 'Judge unavailable' }));
  }
}

async function persistABResult(result: ABTestResult): Promise<string | null> {
  const cfg = getEsConfig();
  await ensureEsIndex(cfg.endpoint, ABTEST_INDEX, {
    mappings: { properties: { created_date: { type: 'date' }, winner: { type: 'keyword' } } },
  });

  try {
    const res = await fetch(`${cfg.endpoint}/${ABTEST_INDEX}/_doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    const data: any = await res.json();
    return data._id || null;
  } catch {
    return null;
  }
}

/** Run a full A/B test: execute variants, judge responses, persist results. */
export async function splitTest(
  variants: ABVariant[],
  opts: { metrics?: string[]; signal?: AbortSignal; parallel?: boolean } = {},
  ollamaEndpoints: string[],
  defaultModel: string,
): Promise<ABTestResult> {
  const metrics = opts.metrics ?? DEFAULT_METRICS;
  const parallel = opts.parallel !== false;

  telemetry.emit('abtest:start', { variantCount: variants.length, metrics });

  const variantResponses = parallel
    ? await Promise.all(variants.map(v => runVariant(v, ollamaEndpoints, defaultModel, opts.signal)))
    : await variants.reduce(async (accP, v) => {
        const acc = await accP;
        return [...acc, await runVariant(v, ollamaEndpoints, defaultModel, opts.signal)];
      }, Promise.resolve([] as Array<{ response: string; durationMs: number; error?: string }>));

  const results: ABVariantResult[] = await Promise.all(
    variants.map(async (variant, i) => {
      const { response, durationMs, error } = variantResponses[i];
      if (error || !response) {
        return { label: variant.label, prompt: variant.prompt, response: '', scores: [], totalScore: 0, durationMs, error };
      }
      const scores = await judgeResponse(variant.prompt, response, metrics, ollamaEndpoints, defaultModel);
      return { label: variant.label, prompt: variant.prompt, response, scores, totalScore: scores.reduce((s, m) => s + m.score, 0), durationMs };
    }),
  );

  const best = results.reduce((b, r) => (r.totalScore > b.totalScore ? r : b), results[0]);
  const winner = best?.totalScore > 0 ? best.label : null;

  const abResult: ABTestResult = { variants, metrics, results, winner, created_date: new Date().toISOString() };
  const id = await persistABResult(abResult);
  if (id) abResult.id = id;

  telemetry.emit('abtest:complete', { winner, variantCount: variants.length });
  return abResult;
}

/** Retrieve past A/B test results from ES. */
export async function getABTestHistory(limit = 20): Promise<ABTestResult[]> {
  const cfg = getEsConfig();
  try {
    const res = await fetch(`${cfg.endpoint}/${ABTEST_INDEX}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match_all: {} }, sort: [{ created_date: { order: 'desc' } }], size: limit }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.hits?.hits || []).map((h: any) => ({ id: h._id, ...h._source }));
  } catch {
    return [];
  }
}