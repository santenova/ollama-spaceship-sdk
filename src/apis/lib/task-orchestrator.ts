/**
 * TaskOrchestrator — extracted business-logic methods from client.ts (#3)
 * Houses `solution`, `beaming`, and `expandQuery` so client.ts stays focused
 * on networking and configuration.
 *
 * All methods accept `ollamaEndpoints` and `defaultModel` so they work with
 * the live resolved values from the parent client.
 */

import { invokeLLM } from '../client';
import { modelRouter } from './model-router';
import { abortManager } from './abort-manager';
import { telemetry } from './telemetry';
import { clientLogger } from './client-logger';
import { trackedOllamaFetch } from './ollama-tracker';
import { getEsConfig } from './es-entities';

// ─── expandQuery ─────────────────────────────────────────────────────────────

export async function expandQuery(
  query: string,
  ollamaEndpoints: string[],
  defaultModel: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!query?.trim()) return [];
  const endpoint = (ollamaEndpoints[0] || ollamaEndpoints[1] || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const useModel = modelRouter.resolve('chat', query, defaultModel);
  const prompt = `You are a search query expansion expert. Given the query "${query}", output a JSON array of 5-8 closely related search terms, synonyms, and technical concepts that would help retrieve relevant documents. Output ONLY the JSON array, no explanation. Example: ["term1","term2","term3"]`;

  const controller = abortManager.create('expandQuery');
  if (signal) signal.addEventListener('abort', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await trackedOllamaFetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: useModel, messages: [{ role: 'user', content: prompt }], stream: false }),
      signal: controller.signal,
    }, 'expandQuery');

    if (!res.ok) throw new Error(`expandQuery error: ${res.status}`);
    const json: any = await res.json();
    const text = json.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [query];
    const expanded = JSON.parse(match[0]).filter((t: unknown) => typeof t === 'string' && t.trim());
    telemetry.emit('client:expand-query', { query, terms: expanded.slice(0, 7) });
    return [query, ...expanded.slice(0, 7)];
  } finally {
    clearTimeout(timeout);
    abortManager.cancel('expandQuery');
  }
}

// ─── solution ────────────────────────────────────────────────────────────────

import { esEntities } from './es-entities';

export async function solution(
  prompt: string,
  ollamaEndpoints: string[],
  defaultModel: string,
  signal?: AbortSignal,
): Promise<{ manifest: string; personas: any[]; debate: string[] }> {
  const kwEndpoint = (ollamaEndpoints[0] || ollamaEndpoints[1] || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const keywordPrompt = `Given the problem statement: "${prompt}". Output ONLY a JSON array of 3-5 focused search keywords that would find AI personas qualified to solve this problem. Example: ["keyword1","keyword2"]. Output ONLY the JSON array.`;
  const kwModel = modelRouter.resolve('json', keywordPrompt, defaultModel);

  const controller = abortManager.create('solution');
  if (signal) signal.addEventListener('abort', () => controller.abort());

  const kwTimeout = setTimeout(() => controller.abort(), 90_000);
  const kwRes = await trackedOllamaFetch(`${kwEndpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: kwModel, messages: [{ role: 'user', content: keywordPrompt }], stream: false }),
    signal: controller.signal,
  }, 'solution-keywords').finally(() => clearTimeout(kwTimeout));

  if (!kwRes.ok) throw new Error(`solution keyword error: ${kwRes.status}`);
  const kwJson: any = await kwRes.json();
  const kwText = kwJson.choices?.[0]?.message?.content || '';
  const match = kwText.match(/\[[\s\S]*?\]/);
  const keywords: string[] = match
    ? JSON.parse(match[0]).filter((t: unknown) => typeof t === 'string')
    : [prompt];
  const terms = [prompt, ...keywords].slice(0, 7);

  // Persona search
  const esCfg = getEsConfig();
  const personaIndex = esCfg.indices?.['Persona'] || 'sample-prompt-persona';
  const seen = new Set<string>();
  const personas: any[] = [];

  const shouldClauses = terms.map((term: string) => ({
    multi_match: {
      query: term,
      fields: ['name^3', 'description^2', 'expertise_areas', 'instructions', 'tags'],
      type: 'best_fields',
      operator: 'or',
    },
  }));

  const searchRes = await fetch(`${esCfg.endpoint}/${personaIndex}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: { bool: { should: shouldClauses, minimum_should_match: 1 } },
      size: 10,
      sort: [{ _score: { order: 'desc' } }, { created_date: { order: 'desc' } }],
    }),
  });
  if (searchRes.ok) {
    const searchData: any = await searchRes.json();
    for (const hit of (searchData.hits?.hits || [])) {
      if (!seen.has(hit._id) && personas.length < 2) {
        seen.add(hit._id);
        personas.push({ id: hit._id, ...hit._source });
      }
    }
  }
  if (personas.length < 2) {
    const allPersonas = await (esEntities as any).Persona.list('-created_date', 10);
    for (const p of allPersonas) {
      if (!seen.has(p.id) && personas.length < 2) {
        seen.add(p.id);
        personas.push(p);
      }
    }
  }
  if (personas.length < 2) {
    throw new Error(`solution: need 2 personas but only found ${personas.length} for "${prompt}"`);
  }

  const systemA = `You are ${personas[0].name}. ${personas[0].description || ''}. ${personas[0].instructions || ''} Respond concisely as this persona.`;
  const systemB = `You are ${personas[1].name}. ${personas[1].description || ''}. ${personas[1].instructions || ''} Respond concisely as this persona.`;
  const debate: string[] = [];
  const thinkingModel = modelRouter.resolve('thinking', prompt, defaultModel);

  const [t1, t2] = await Promise.all([
    invokeLLM({ system: systemA, messages: [{ role: 'user', content: `Problem: "${prompt}". Analyze this problem and propose your key solution in 2–3 sentences.` }], ollamaEndpoints, defaultModel, model: thinkingModel, temperature: 0.7 }),
    invokeLLM({ system: systemB, messages: [{ role: 'user', content: `Offer your own approach to "${prompt}" in 2–3 sentences.` }], ollamaEndpoints, defaultModel, model: thinkingModel, temperature: 0.7 }),
  ]);
  debate.push(t1 as string, t2 as string);

  const t3 = await invokeLLM({ system: `${systemA}. ${personas[1].name} just argued: "${(t2 as string).slice(0, 300)}"`, messages: [{ role: 'user', content: `Respond to the critique and refine your solution in 2–3 sentences.` }], ollamaEndpoints, defaultModel, model: thinkingModel, temperature: 0.7 });
  debate.push(t3 as string);

  const manifest = await invokeLLM({
    system: 'You are an impartial solution synthesis expert. Synthesize the best of both perspectives into a concrete, actionable solution.',
    messages: [
      { role: 'user', content: `${personas[0].name} argued:\n${(t1 as string).slice(0, 400)}\n` },
      { role: 'user', content: `${personas[1].name} argued:\n${(t2 as string).slice(0, 400)}\n` },
      { role: 'user', content: `${personas[0].name} refined:\n${(t3 as string).slice(0, 400)}\n` },
    ],
    ollamaEndpoints,
    defaultModel,
    model: modelRouter.resolve('chat', prompt, defaultModel),
    temperature: 0.5,
  }) as string;

  abortManager.cancel('solution');
  return { manifest, personas, debate };
}

// ─── beaming ─────────────────────────────────────────────────────────────────

export async function beaming(
  prompt: string,
  ollamaEndpoints: string[],
  defaultModel: string,
  opts: { taskType?: 'chat' | 'thinking' | 'json' | 'vision'; signal?: AbortSignal; concurrency?: number } = {},
): Promise<{
  prompt: string;
  taskType: string;
  models: string[];
  results: Array<{ model: string; status: 'fulfilled' | 'rejected'; response: string | null; error: string | null; durationMs: number }>;
}> {
  const taskType = opts.taskType ?? 'chat';
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const models = modelRouter.resolveAll(taskType, defaultModel);

  clientLogger.info('beaming:start', { prompt: prompt.slice(0, 80), taskType, modelCount: models.length, concurrency });

  let active = 0;
  const waitQueue: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    if (active < concurrency) { active++; resolve(); }
    else waitQueue.push(resolve);
  });
  const release = () => {
    active--;
    const next = waitQueue.shift();
    if (next) { active++; next(); }
  };

  const results = await Promise.all(
    models.map(async (model) => {
      const start = Date.now();
      await acquire();
      try {
        const result = await clientLogger.timed(`beaming:${model}`, () =>
          invokeLLM({ prompt, model, stream: false, signal: opts.signal, ollamaEndpoints, defaultModel: model })
        , { model, taskType });
        const response = typeof result === 'string' ? result : JSON.stringify(result);
        return { model, status: 'fulfilled' as const, response, error: null, durationMs: Date.now() - start };
      } catch (err: any) {
        return { model, status: 'rejected' as const, response: null, error: err?.message ?? String(err), durationMs: Date.now() - start };
      } finally {
        release();
      }
    })
  );

  clientLogger.info('beaming:done', { taskType, fulfilled: results.filter(r => r.status === 'fulfilled').length });
  return { prompt, taskType, models, results };
}