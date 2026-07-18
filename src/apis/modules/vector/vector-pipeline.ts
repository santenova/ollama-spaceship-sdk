/**
 * Vector pipeline: message → keywords → _all match search → reindex matched
 * docs into a dedicated vector index (created FIRST with explicit settings) →
 * embed single-value array fields (tags, expertise_areas, …) as additional
 * key embeddings via Ollama /v1/embeddings.
 */

interface VectorPipelineOpts {
  message: string;
  ollamaEndpoints: string[];
  chatModel: string;
  embeddingModel: string;
  esEndpoint: string;
  targetIndex?: string;
  dims?: number;
  arrayFields?: string[];
  /** Field names to pull from matched docs and append to the vector-key embedding text. */
  keyNames?: string[];
  /**
   * Explicit source index / indices to restrict the search to.
   * - undefined or '*' → search _all (existing behaviour).
   * - single index string → Mode 1: duplicate as "{sourceIndex}-vector".
   * - array with >1 item  → Mode 2: minimal reference index with pointers only.
   */
  sourceIndices?: string | string[];
  signal?: AbortSignal;
}

/** Derive the creation mode and target index name from sourceIndices. */
function resolveMode(sourceIndices: string | string[] | undefined, explicitTarget?: string): {
  mode: 'all' | 'single' | 'multi';
  sources: string[];
  resolvedTarget: string;
} {
  if (!sourceIndices || sourceIndices === '*' || sourceIndices === '_all') {
    return {
      mode: 'all',
      sources: ['_all'],
      resolvedTarget: explicitTarget || 'vector-key-embeddings',
    };
  }
  const arr = Array.isArray(sourceIndices) ? sourceIndices.filter(Boolean) : [sourceIndices];
  if (arr.length === 1) {
    // Mode 1 — single source: duplicate as "{source}-vector"
    return {
      mode: 'single',
      sources: arr,
      resolvedTarget: explicitTarget || `${arr[0]}-vector`,
    };
  }
  // Mode 2 — multiple sources: minimal reference index
  return {
    mode: 'multi',
    sources: arr,
    resolvedTarget: explicitTarget || `ref-multi-${Date.now()}`,
  };
}

interface DocRef { index: string; id: string; source: any }

/** Step 1 — expand the user message into 3-5 focused search keywords. */
async function expandKeywords(message: string, endpoint: string, model: string, signal?: AbortSignal): Promise<string[]> {
  const prompt = `Given the message: "${message}". Output ONLY a JSON array of 3-5 focused search keywords that would retrieve relevant documents. Example: ["keyword1","keyword2"]. Output ONLY the JSON array.`;
  const controller = new AbortController();
  if (signal) signal.addEventListener('abort', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) return [message];
    const json: any = await res.json();
    const text = json.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [message];
    const arr = JSON.parse(match[0]).filter((t: unknown) => typeof t === 'string' && t.trim());
    return [message, ...arr].slice(0, 6);
  } catch {
    return [message];
  } finally {
    clearTimeout(timeout);
  }
}

/** Step 2 — keyword search across the given sources (defaults to _all). */
async function searchAll(esEndpoint: string, keywords: string[], targetIndex: string, sources: string[] = ['_all']): Promise<DocRef[]> {
  const should = keywords.map(term => ({
    multi_match: { query: term, fields: ['*'], type: 'best_fields', operator: 'or' },
  }));
  // For a single explicit source use it directly; for _all or multi join with commas
  const indexParam = sources[0] === '_all' ? '_all' : sources.join(',');
  const res = await fetch(`${esEndpoint}/${indexParam}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: { bool: { should, minimum_should_match: 1 } },
      size: 100,
    }),
  });
  if (!res.ok) throw new Error(`searchAll: ${res.status} ${res.statusText}`);
  const data: any = await res.json();
  const hits = data.hits?.hits || [];
  const seen = new Set<string>();
  const refs: DocRef[] = [];
  for (const h of hits) {
    if (h._index === targetIndex) continue;
    const key = `${h._index}::${h._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ index: h._index, id: h._id, source: h._source });
  }
  return refs;
}

/** Step 3 — create the target index FIRST, before any docs are reindexed into it. */
async function ensureVectorIndex(esEndpoint: string, index: string, dims: number): Promise<void> {
  const check = await fetch(`${esEndpoint}/${index}`, { method: 'HEAD' });
  if (check.status !== 404) return; // already exists — leave as-is
  const body = {
    settings: {
      index: {
        number_of_shards: 2,
        number_of_replicas: 1,
      },
    },
    mappings: {
      dynamic_templates: [
        {
          // text + .keyword for every string field (full-text + exact/sort)
          strings_as_keyword: {
            match_mapping_type: 'string',
            mapping: {
              type: 'text',
              fields: { keyword: { type: 'keyword', ignore_above: 512 } },
            },
          },
        },
        {
          // *_embedding fields → stored objects (value → vector), not indexed
          embedding_keys: {
            match: '*_embedding',
            mapping: { type: 'object', enabled: false },
          },
        },
      ],
      properties: {
        id:           { type: 'keyword' },
        created_date: { type: 'date' },
        updated_date: { type: 'date' },
        // primary dense_vector for the message embedding (populated on demand)
        content_vector: { type: 'dense_vector', dims, index: true, similarity: 'cosine' },
      },
    },
  };
  const res = await fetch(`${esEndpoint}/${index}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`ensureVectorIndex: ${res.status} ${res.statusText} — ${txt}`);
  }
}

/** Step 4 — reindex matched doc refs into the target index via ES _reindex (ids query). */
async function reindexRefs(esEndpoint: string, refs: DocRef[], targetIndex: string): Promise<{ srcIndex: string; created: number; updated: number }[]> {
  const byIndex: Record<string, string[]> = {};
  for (const r of refs) {
    if (r.index === targetIndex) continue;
    (byIndex[r.index] ||= []).push(r.id);
  }
  const stats: { srcIndex: string; created: number; updated: number }[] = [];
  for (const [srcIndex, ids] of Object.entries(byIndex)) {
    const res = await fetch(`${esEndpoint}/_reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { index: srcIndex, query: { ids: { values: ids } } },
        dest: { index: targetIndex },
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    stats.push({ srcIndex, created: data.created || 0, updated: data.updated || 0 });
  }
  return stats;
}

/** Embed a single text value via Ollama /v1/embeddings. */
async function embedValue(endpoint: string, model: string, text: string, signal?: AbortSignal): Promise<number[] | null> {
  const controller = new AbortController();
  if (signal) signal.addEventListener('abort', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${endpoint}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.data?.[0]?.embedding || json?.embedding || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Step 4b — embed the original message (+ optional doc field values) and store
 *  it as the dense vector key (`content_vector`) in a summary doc. */
async function writeVectorKey(
  esEndpoint: string,
  targetIndex: string,
  message: string,
  keywords: string[],
  endpoint: string,
  embeddingModel: string,
  matchedCount: number,
  refs: DocRef[],
  keyNames: string[],
  signal?: AbortSignal,
): Promise<number[] | null> {
  // Gather unique non-empty values for each keyName across all matched docs
  let embeddingText = message;
  if (keyNames.length > 0 && refs.length > 0) {
    const seen = new Set<string>();
    const extras: string[] = [];
    for (const ref of refs) {
      for (const key of keyNames) {
        const val = ref.source?.[key];
        const values = Array.isArray(val) ? val : (val != null ? [val] : []);
        for (const v of values) {
          const s = String(v).trim();
          if (s && !seen.has(s)) { seen.add(s); extras.push(s); }
        }
      }
    }
    if (extras.length) embeddingText = `${message}\n${extras.join(' ')}`;
  }
  const vec = await embedValue(endpoint, embeddingModel, embeddingText, signal);
  if (!vec) return null;
  const doc = {
    id: `vector-key-${Date.now()}`,
    type: 'vector_key',
    message,
    keywords,
    matched_count: matchedCount,
    content_vector: vec,
    created_date: new Date().toISOString(),
  };
  await fetch(`${esEndpoint}/${targetIndex}/_doc/${doc.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  return vec;
}

/**
 * Concurrency-limited worker-pool helper (#4).
 * Runs `tasks` with at most `limit` concurrent executions.
 */
async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return results;
}

/** Step 5 — walk single-value array fields, embed each value in parallel (max 4 concurrent). */
async function enrichEmbeddings(
  esEndpoint: string,
  targetIndex: string,
  arrayFields: string[],
  endpoint: string,
  embeddingModel: string,
  signal?: AbortSignal,
): Promise<number> {
  const searchRes = await fetch(`${esEndpoint}/${targetIndex}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { match_all: {} }, size: 500 }),
  });
  if (!searchRes.ok) return 0;
  const searchData: any = await searchRes.json();
  const hits: any[] = searchData.hits?.hits || [];

  // Collect all (hit, field, item) tuples that need embedding
  type EmbedTask = { hitId: string; field: string; item: string };
  const tasks: EmbedTask[] = [];
  for (const hit of hits) {
    const src = hit._source || {};
    for (const field of arrayFields) {
      const val = src[field];
      if (!Array.isArray(val) || !val.length || typeof val[0] !== 'string') continue;
      for (const item of val) {
        if (typeof item === 'string' && item.trim()) tasks.push({ hitId: hit._id, field, item });
      }
    }
  }

  // Embed all values in parallel, capped at 4 concurrent Ollama calls
  const embeddingResults = await pooled(
    tasks.map(t => () => embedValue(endpoint, embeddingModel, t.item, signal).then(vec => ({ ...t, vec }))),
    4,
  );

  // Group results back by hit id → field → item
  const byHit: Record<string, Record<string, Record<string, number[]>>> = {};
  for (const { hitId, field, item, vec } of embeddingResults) {
    if (!vec) continue;
    (byHit[hitId] ??= {});
    (byHit[hitId][`${field}_embedding`] ??= {})[item] = vec;
  }

  const bulkLines: string[] = [];
  for (const [id, embeddings] of Object.entries(byHit)) {
    bulkLines.push(JSON.stringify({ update: { _index: targetIndex, _id: id } }));
    bulkLines.push(JSON.stringify({ doc: embeddings }));
  }

  if (bulkLines.length) {
    await fetch(`${esEndpoint}/_bulk?refresh=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: bulkLines.join('\n') + '\n',
    });
  }
  return Object.keys(byHit).length;
}

/**
 * Mode 1 — single source: copy ALL docs from the source index into "{source}-vector"
 * via ES _reindex (no keyword filtering), then write only the vector-key summary doc.
 */
async function reindexFullCopy(
  esEndpoint: string,
  sourceIndex: string,
  targetIndex: string,
): Promise<{ created: number; updated: number }> {
  const res = await fetch(`${esEndpoint}/_reindex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: { index: sourceIndex },
      dest: { index: targetIndex },
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  return { created: data.created || 0, updated: data.updated || 0 };
}

/**
 * Mode 2 — multiple sources: write minimal pointer docs to the reference index.
 * Each doc contains only: content_vector, _source_index, _source_id (no full payload).
 */
async function writeReferencePointers(
  esEndpoint: string,
  targetIndex: string,
  refs: DocRef[],
  embeddings: Map<string, number[]>,
): Promise<number> {
  if (!refs.length) return 0;
  const lines: string[] = [];
  for (const ref of refs) {
    const vec = embeddings.get(`${ref.index}::${ref.id}`);
    const doc: any = {
      _source_index: ref.index,
      _source_id: ref.id,
      created_date: new Date().toISOString(),
    };
    if (vec) doc.content_vector = vec;
    lines.push(JSON.stringify({ index: { _index: targetIndex } }));
    lines.push(JSON.stringify(doc));
  }
  await fetch(`${esEndpoint}/_bulk?refresh=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: lines.join('\n') + '\n',
  });
  return refs.length;
}

/** Ensure a minimal reference index with only the dense_vector mapping (no dynamic templates). */
async function ensureRefIndex(esEndpoint: string, index: string, dims: number): Promise<void> {
  const check = await fetch(`${esEndpoint}/${index}`, { method: 'HEAD' });
  if (check.status !== 404) return;
  const body = {
    settings: { index: { number_of_shards: 1, number_of_replicas: 1 } },
    mappings: {
      properties: {
        _source_index: { type: 'keyword' },
        _source_id:    { type: 'keyword' },
        created_date:  { type: 'date' },
        content_vector: { type: 'dense_vector', dims, index: true, similarity: 'cosine' },
      },
    },
  };
  await fetch(`${esEndpoint}/${index}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Full orchestrator. Returns keywords, matched count, reindex stats, enriched count, mode. */
export async function vectorPipeline(opts: VectorPipelineOpts) {
  const {
    message,
    ollamaEndpoints,
    chatModel,
    embeddingModel,
    esEndpoint,
    targetIndex: explicitTarget,
    dims = 768,
    arrayFields = ['tags', 'expertise_areas'],
    keyNames = [],
    sourceIndices,
    signal,
  } = opts;

  const llmEndpoint = (ollamaEndpoints[0] || ollamaEndpoints[1] || 'http://127.0.0.1:11434').replace(/\/$/, '');

  // Resolve mode + target index name
  const { mode, sources, resolvedTarget } = resolveMode(sourceIndices, explicitTarget);

  // 1. message → keywords
  const keywords = await expandKeywords(message, llmEndpoint, chatModel, signal);

  if (mode === 'single') {
    // ── MODE 1: full duplicate + vector key only ──────────────────────────────
    const sourceIndex = sources[0];
    // Create the vector index with full mapping
    await ensureVectorIndex(esEndpoint, resolvedTarget, dims);
    // Copy all docs from the source index
    const copyStats = await reindexFullCopy(esEndpoint, sourceIndex, resolvedTarget);
    // Write vector-key summary doc (embed message only)
    const vectorKey = await writeVectorKey(
      esEndpoint, resolvedTarget, message, keywords, llmEndpoint,
      embeddingModel, copyStats.created + copyStats.updated, [], keyNames, signal,
    );
    return {
      mode: 'single' as const,
      keywords,
      sourceIndex,
      targetIndex: resolvedTarget,
      matchedCount: copyStats.created + copyStats.updated,
      reindexStats: [{ srcIndex: sourceIndex, ...copyStats }],
      enrichedCount: 0,
      vectorKey,
    };
  }

  if (mode === 'multi') {
    // ── MODE 2: minimal reference index with pointer docs ────────────────────
    // Search across all specified source indices
    const refs = await searchAll(esEndpoint, keywords, resolvedTarget, sources);
    // Embed each matched doc's preview text for the pointer
    const embeddings = new Map<string, number[]>();
    await pooled(
      refs.map(ref => async () => {
        const text = keyNames
          .map(k => {
            const v = ref.source?.[k];
            return Array.isArray(v) ? v.join(' ') : (v != null ? String(v) : '');
          })
          .filter(Boolean)
          .join(' ') || message;
        const vec = await embedValue(llmEndpoint, embeddingModel, text, signal);
        if (vec) embeddings.set(`${ref.index}::${ref.id}`, vec);
      }),
      4,
    );
    await ensureRefIndex(esEndpoint, resolvedTarget, dims);
    const written = await writeReferencePointers(esEndpoint, resolvedTarget, refs, embeddings);
    // Write the top-level vector key summary doc
    const vectorKey = await writeVectorKey(
      esEndpoint, resolvedTarget, message, keywords, llmEndpoint,
      embeddingModel, refs.length, refs, keyNames, signal,
    );
    return {
      mode: 'multi' as const,
      keywords,
      sourceIndices: sources,
      targetIndex: resolvedTarget,
      matchedCount: refs.length,
      reindexStats: [],
      enrichedCount: written,
      vectorKey,
    };
  }

  // ── MODE all: original behaviour (search _all, reindex everything) ──────────
  const refs = await searchAll(esEndpoint, keywords, resolvedTarget, ['_all']);
  await ensureVectorIndex(esEndpoint, resolvedTarget, dims);
  const reindexStats = await reindexRefs(esEndpoint, refs, resolvedTarget);
  const vectorKey = await writeVectorKey(
    esEndpoint, resolvedTarget, message, keywords, llmEndpoint,
    embeddingModel, refs.length, refs, keyNames, signal,
  );
  const enrichedCount = await enrichEmbeddings(esEndpoint, resolvedTarget, arrayFields, llmEndpoint, embeddingModel, signal);

  return {
    mode: 'all' as const,
    keywords,
    matchedCount: refs.length,
    reindexStats,
    enrichedCount,
    targetIndex: resolvedTarget,
    vectorKey,
  };
}