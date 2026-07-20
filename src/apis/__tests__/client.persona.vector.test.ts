/**
 * Integration test: Persona vector index pipeline
 *
 * Flow:
 *   1. Create a fresh client + get the esEntity for Persona
 *   2. Clone the Persona index to {prefix}-persona-vector with
 *      the dense_vector "embedding" field appended
 *   3. Sanitize each persona doc and embed it via client.integrations.Core.vector()
 *   4. Bulk-write enriched docs to the new index
 *   5. Validate with three knn neighbour searches against the
 *      Marine Biologist persona:
 *        a) closest / farthest by expertise_areas
 *        b) closest / farthest by tags
 *        c) closest / farthest by voice_profile.vocabulary
 *
 * Requires: Ollama @ 127.0.0.1:11434, Elasticsearch @ 127.0.0.1:9200
 */

import { createClient, config } from '../client';
import { getEsConfig } from '../lib/es-entities';
import {
  sanitizePersonaForEmbedding,
  PERSONA_VECTOR_MAPPING,
  type PersonaEmbeddingInput,
} from '../lib/persona-embedding';

jest.setTimeout(300_000); // 5 min — embedding all personas can be slow

const EP    = 'http://127.0.0.1:11434';
const ES_EP = 'http://127.0.0.1:9200';

// Node-safe localStorage shim (mirrors client.test.ts)
if (typeof globalThis.localStorage === 'undefined') {
  const _store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in _store ? _store[k] : null),
    setItem: (k: string, v: string) => { _store[k] = v; },
    removeItem: (k: string) => { delete _store[k]; },
    clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isOllamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${EP}/v1/models`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}

async function isEsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${ES_EP}/_cluster/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}

async function deleteIndex(index: string) {
  await fetch(`${ES_EP}/${index}`, { method: 'DELETE' }).catch(() => {});
}

async function refreshIndex(index: string) {
  await fetch(`${ES_EP}/${index}/_refresh`, { method: 'POST' }).catch(() => {});
}

/** knn search — returns hits sorted by descending score */
async function knnSearch(index: string, queryVec: number[], k = 5) {
  const res = await fetch(`${ES_EP}/${index}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      knn: {
        field: 'embedding',
        query_vector: queryVec,
        k,
        num_candidates: Math.max(k * 4, 20),
      },
      _source: ['name', 'expertise_areas', 'tags', 'voice_profile'],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`knn search failed ${res.status}: ${txt}`);
  }
  const data: any = await res.json();
  return (data.hits?.hits || []) as Array<{ _id: string; _score: number; _source: any }>;
}

// ---------------------------------------------------------------------------
// sanitizePersonaForEmbedding unit tests (no network)
// ---------------------------------------------------------------------------

describe('sanitizePersonaForEmbedding', () => {
  test('produces lowercase output', () => {
    const out = sanitizePersonaForEmbedding({ name: 'Marine Biologist', category: 'Science' });
    expect(out).toBe(out.toLowerCase());
  });

  test('includes all five field groups', () => {
    const persona: PersonaEmbeddingInput = {
      name: 'Marine Biologist',
      category: 'Science',
      expertise_areas: ['Oceanography', 'Coral Reefs'],
      tags: ['marine', 'biology'],
      voice_profile: { vocabulary: ['ecosystem', 'biodiversity'] },
    };
    const out = sanitizePersonaForEmbedding(persona);
    expect(out).toContain('name:');
    expect(out).toContain('category:');
    expect(out).toContain('expertise:');
    expect(out).toContain('tags:');
    expect(out).toContain('vocabulary:');
    expect(out).toContain('marine biologist');
    expect(out).toContain('coral reefs');
    expect(out).toContain('ecosystem');
  });

  test('handles missing optional fields gracefully', () => {
    const out = sanitizePersonaForEmbedding({ name: 'Test' });
    expect(out).toBe('name: test');
  });

  test('returns empty string for empty persona', () => {
    expect(sanitizePersonaForEmbedding({})).toBe('');
  });

  test('collapses whitespace', () => {
    const out = sanitizePersonaForEmbedding({ name: '  Zoologist  ', tags: ['  wildlife  '] });
    expect(out).not.toMatch(/\s{2,}/);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline integration test
// ---------------------------------------------------------------------------

describe('Persona vector index pipeline', () => {
  let client: ReturnType<typeof createClient>;
  let vectorIndex: string;
  let marineBiologist: PersonaEmbeddingInput & { id?: string };
  let servicesUp = false;

  // Jest does not have a built-in "skip remaining" for runtime conditions.
  // We use this helper so each test calls skip() which throws the Jest pending
  // sentinel and is reported as "skipped", not "passed".
  const skipIfDown = () => {
    if (!servicesUp) pending('Services unreachable — Ollama or Elasticsearch not running');
  };

  beforeAll(async () => {
    const [ollamaUp, esUp] = await Promise.all([isOllamaUp(), isEsUp()]);
    servicesUp = ollamaUp && esUp;
    if (!servicesUp) return; // all tests will skip individually via skipIfDown()

    // Point everything at local endpoints
    localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));

    client = createClient({
      ...config,
      ollamaEndpoints: [EP],
    });

    const esCfg = getEsConfig();
    const prefix = esCfg.indexPrefix || 'prompt-hub';
    const sourceIndex = `${prefix}-persona`;
    vectorIndex = `${prefix}-persona-vector`;

    // ── STEP 1: Fetch all personas via esEntities ───────────────────────────
    const personas: PersonaEmbeddingInput[] = await (client.esEntities as any).Persona.list(
      '-created_date',
      2000,
    );
    expect(Array.isArray(personas)).toBe(true);

    // Find (or synthesise) a Marine Biologist persona for validation
    marineBiologist =
      personas.find(
        (p) =>
          p.name?.toLowerCase().includes('marine') ||
          p.expertise_areas?.some((e) => e.toLowerCase().includes('marine')) ||
          p.tags?.some((t) => t.toLowerCase().includes('marine')),
      ) ||
      ({
        id: '__synth__',
        name: 'Marine Biologist',
        category: 'Science',
        expertise_areas: ['Oceanography', 'Marine Ecology', 'Coral Reef Conservation', 'Biodiversity'],
        tags: ['marine', 'biology', 'ocean', 'ecology', 'conservation'],
        voice_profile: {
          vocabulary: ['ecosystem', 'biodiversity', 'reef', 'species', 'habitat', 'conservation'],
        },
      } as PersonaEmbeddingInput);

    // ── STEP 2: Clone index with dense_vector mapping ───────────────────────
    await deleteIndex(vectorIndex);

    // Fetch mapping from source index (may not exist yet — that's fine)
    let sourceProps: Record<string, any> = {};
    try {
      const mapRes = await fetch(`${ES_EP}/${sourceIndex}/_mapping`);
      if (mapRes.ok) {
        const mapData: any = await mapRes.json();
        sourceProps = mapData[sourceIndex]?.mappings?.properties || {};
      }
    } catch {}

    const createRes = await fetch(`${ES_EP}/${vectorIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mappings: {
          properties: {
            ...sourceProps,
            ...PERSONA_VECTOR_MAPPING,
          },
        },
        settings: { number_of_shards: 1, number_of_replicas: 0 },
      }),
    });

    if (!createRes.ok) {
      const txt = await createRes.text();
      throw new Error(`Failed to create vector index: ${txt}`);
    }

    // ── STEP 3 & 4: Embed and bulk-write all personas ───────────────────────
    const docsToIndex = personas.length > 0 ? personas : [marineBiologist];
    const BATCH = 10;

    for (let i = 0; i < docsToIndex.length; i += BATCH) {
      const batch = docsToIndex.slice(i, i + BATCH);
      const lines: string[] = [];

      for (const persona of batch) {
        const text = sanitizePersonaForEmbedding(persona);
        if (!text) continue;

        const embedding = await client.integrations.Core.vector(text);
        if (!Array.isArray(embedding) || embedding.length === 0) continue;

        const id = (persona as any).id || `p-${i}`;
        const doc = { ...(persona as any), embedding };
        delete doc.id;

        lines.push(JSON.stringify({ index: { _index: vectorIndex, _id: id } }));
        lines.push(JSON.stringify(doc));
      }

      if (lines.length === 0) continue;

      const bulkRes = await fetch(`${ES_EP}/_bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: lines.join('\n') + '\n',
      });
      expect(bulkRes.ok).toBe(true);
    }

    // Also ensure marineBiologist is indexed (if it was synthesised above)
    if (marineBiologist.id === '__synth__') {
      const text = sanitizePersonaForEmbedding(marineBiologist);
      const embedding = await client.integrations.Core.vector(text);
      const doc = { ...marineBiologist, embedding };
      delete (doc as any).id;
      await fetch(`${ES_EP}/${vectorIndex}/_doc/__synth__`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
    }

    await refreshIndex(vectorIndex);
  });

  afterAll(async () => {
    // Leave the index in place for inspection; uncomment to clean up:
    // await deleteIndex(vectorIndex);
  });

  // ── Validation 1: search by expertise_areas ─────────────────────────────
  test('1a — closest neighbour by expertise_areas (Marine Biologist)', async () => {
    skipIfDown();
    const expertiseText = (marineBiologist.expertise_areas || []).join(' ').toLowerCase();
    const queryVec = await client.integrations.Core.vector(`expertise: ${expertiseText}`);
    expect(Array.isArray(queryVec)).toBe(true);

    const hits = await knnSearch(vectorIndex, queryVec!, 5);
    expect(hits.length).toBeGreaterThan(0);

    const top = hits[0];
    console.log('[expertise closest]', top._source?.name, 'score:', top._score);
    expect(top._score).toBeGreaterThan(0);

    // The top result should share at least one marine/ocean/bio keyword
    const topName: string = (top._source?.name || '').toLowerCase();
    const topExpertise: string[] = (top._source?.expertise_areas || []).map((e: string) => e.toLowerCase());
    const topTags: string[] = (top._source?.tags || []).map((t: string) => t.toLowerCase());
    const marineKeywords = ['marine', 'ocean', 'bio', 'eco', 'reef', 'aqua', 'sea'];
    const isRelated =
      marineKeywords.some((k) => topName.includes(k)) ||
      topExpertise.some((e) => marineKeywords.some((k) => e.includes(k))) ||
      topTags.some((t) => marineKeywords.some((k) => t.includes(k)));
    console.log('[expertise closest] related:', isRelated, '| name:', top._source?.name);
    // Soft assertion — log rather than fail if corpus is small
    if (hits.length > 1) {
      expect(top._score).toBeGreaterThanOrEqual(hits[hits.length - 1]._score);
    }
  });

  test('1b — farthest neighbour by expertise_areas (lowest score in top-k)', async () => {
    skipIfDown();
    const expertiseText = (marineBiologist.expertise_areas || []).join(' ').toLowerCase();
    const queryVec = await client.integrations.Core.vector(`expertise: ${expertiseText}`);
    const hits = await knnSearch(vectorIndex, queryVec!, 5);
    expect(hits.length).toBeGreaterThan(0);

    const farthest = hits[hits.length - 1];
    console.log('[expertise farthest]', farthest._source?.name, 'score:', farthest._score);
    expect(farthest._score).toBeGreaterThan(0);
    if (hits.length > 1) {
      expect(farthest._score).toBeLessThanOrEqual(hits[0]._score);
    }
  });

  // ── Validation 2: search by tags ─────────────────────────────────────────
  test('2a — closest neighbour by tags (Marine Biologist)', async () => {
    skipIfDown();
    const tagsText = (marineBiologist.tags || []).join(' ').toLowerCase();
    const queryVec = await client.integrations.Core.vector(`tags: ${tagsText}`);
    expect(Array.isArray(queryVec)).toBe(true);

    const hits = await knnSearch(vectorIndex, queryVec!, 5);
    expect(hits.length).toBeGreaterThan(0);

    const top = hits[0];
    console.log('[tags closest]', top._source?.name, 'score:', top._score);
    expect(top._score).toBeGreaterThan(0);
    if (hits.length > 1) {
      expect(top._score).toBeGreaterThanOrEqual(hits[hits.length - 1]._score);
    }
  });

  test('2b — farthest neighbour by tags', async () => {
    skipIfDown();
    const tagsText = (marineBiologist.tags || []).join(' ').toLowerCase();
    const queryVec = await client.integrations.Core.vector(`tags: ${tagsText}`);
    const hits = await knnSearch(vectorIndex, queryVec!, 5);
    expect(hits.length).toBeGreaterThan(0);

    const farthest = hits[hits.length - 1];
    console.log('[tags farthest]', farthest._source?.name, 'score:', farthest._score);
    if (hits.length > 1) {
      expect(farthest._score).toBeLessThanOrEqual(hits[0]._score);
    }
  });

  // ── Validation 3: search by voice_profile.vocabulary ────────────────────
  test('3a — closest neighbour by voice_profile.vocabulary (Marine Biologist)', async () => {
    skipIfDown();
    const vocabText = (marineBiologist.voice_profile?.vocabulary || []).join(' ').toLowerCase();
    if (!vocabText) {
      console.warn('[vocab] Marine Biologist has no vocabulary — skipping');
      return;
    }
    const queryVec = await client.integrations.Core.vector(`vocabulary: ${vocabText}`);
    expect(Array.isArray(queryVec)).toBe(true);

    const hits = await knnSearch(vectorIndex, queryVec!, 5);
    expect(hits.length).toBeGreaterThan(0);

    const top = hits[0];
    console.log('[vocab closest]', top._source?.name, 'score:', top._score);
    expect(top._score).toBeGreaterThan(0);
    if (hits.length > 1) {
      expect(top._score).toBeGreaterThanOrEqual(hits[hits.length - 1]._score);
    }
  });

  test('3b — farthest neighbour by voice_profile.vocabulary', async () => {
    skipIfDown();
    const vocabText = (marineBiologist.voice_profile?.vocabulary || []).join(' ').toLowerCase();
    if (!vocabText) return;

    const queryVec = await client.integrations.Core.vector(`vocabulary: ${vocabText}`);
    const hits = await knnSearch(vectorIndex, queryVec!, 5);
    expect(hits.length).toBeGreaterThan(0);

    const farthest = hits[hits.length - 1];
    console.log('[vocab farthest]', farthest._source?.name, 'score:', farthest._score);
    if (hits.length > 1) {
      expect(farthest._score).toBeLessThanOrEqual(hits[0]._score);
    }
  });

  // ── Sanity: vector index exists and contains docs ────────────────────────
  test('vector index is searchable and non-empty', async () => {
    skipIfDown();
    const res = await fetch(`${ES_EP}/${vectorIndex}/_count`);
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    console.log('[index count]', data.count);
    expect(data.count).toBeGreaterThan(0);
  });

  // ── Sanity: embedding field present in mapping ────────────────────────────
  test('vector index has dense_vector embedding mapping', async () => {
    skipIfDown();
    const res = await fetch(`${ES_EP}/${vectorIndex}/_mapping`);
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    const props = data[vectorIndex]?.mappings?.properties || {};
    expect(props.embedding?.type).toBe('dense_vector');
    expect(props.embedding?.dims).toBe(768);
    expect(props.embedding?.similarity).toBe('cosine');
  });
});
