/**
 * Jest test for client.integrations.Core.vector()
 * No fetch mocking — every test hits the real Ollama /v1/embeddings endpoint.
 */

import { createClient, config } from '../client';
import { modelRouter } from '../lib/model-router';
import { getEsConfig } from '../lib/es-entities';
import { getOllamaEndpoint } from '../lib/ollamaEndpoint';
import { getEsEndpoint } from '../lib/esEndpoint';

function getEP(): string { return getOllamaEndpoint(); }
function getES_EP(): string { return getEsEndpoint(); }

async function checkEndpoint() {
  const ep = getEP();
  try {
    const res = await fetch(`${ep}/v1/models`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e: any) {
    throw new Error(`Ollama unreachable at ${ep}: ${e.message}`);
  }
}

describe('client.integrations.Core.vector', () => {
  beforeEach(() => {
    modelRouter.invalidateCache();
  });

  test('is a function on the client', () => {
    const client = createClient(config);
    expect(typeof client.integrations.Core.vector).toBe('function');
  });

  test('returns a non-empty embedding array from real Ollama', async () => {
    await checkEndpoint();
    const client = createClient(config);
    const vec = await client.integrations.Core.vector('ocean cleanup');
    expect(Array.isArray(vec)).toBe(true);
    expect(vec!.length).toBeGreaterThan(0);
    expect(vec!.every((v: number) => typeof v === 'number' && Number.isFinite(v))).toBe(true);
  });

  test('returns null for empty/whitespace text', async () => {
    const client = createClient(config);
    const vec = await client.integrations.Core.vector('   ');
    expect(vec).toBeNull();
  });

  test('is deterministic — same text produces same vector from real Ollama', async () => {
    await checkEndpoint();
    const client = createClient(config);
    const text = 'marine conservation';
    const v1 = await client.integrations.Core.vector(text);
    const v2 = await client.integrations.Core.vector(text);
    expect(Array.isArray(v1)).toBe(true);
    expect(Array.isArray(v2)).toBe(true);
    expect(v1!.length).toBe(v2!.length);
    const same = v1!.every((val: number, i: number) => Math.abs(val - v2![i]) < 1e-6);
    expect(same).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reindex → vector search integration
// ---------------------------------------------------------------------------

const TEST_INDEX = 'test-vector-reindex-search';

async function checkElasticsearch() {
  const esEp = getES_EP();
  try {
    const res = await fetch(`${esEp}/_cluster/health`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e: any) {
    throw new Error(`Elasticsearch unreachable at ${esEp}: ${e.message}`);
  }
}

async function deleteIndex(index: string) {
  await fetch(`${getES_EP()}/${index}`, { method: 'DELETE' }).catch(() => {});
}

describe('reindex → vector search', () => {
  beforeAll(async () => {
    await checkElasticsearch().catch(() => {});
    await checkEndpoint().catch(() => {});
  });

  afterAll(async () => {
    await deleteIndex(TEST_INDEX);
  });

  test('reindexed docs are findable via knn cosine search', async () => {
    await checkElasticsearch();
    await checkEndpoint();

    const client = createClient(config);

    // 1. Embed two semantically distinct documents
    const text1 = 'coral reef restoration and marine biodiversity';
    const text2 = 'mountain hiking and alpine flora';
    const vec1 = await client.integrations.Core.vector(text1);
    const vec2 = await client.integrations.Core.vector(text2);
    expect(Array.isArray(vec1)).toBe(true);
    expect(Array.isArray(vec2)).toBe(true);
    const dims = vec1!.length;

    // 2. Create the target vector index with dense_vector mapping
    const esEp = getES_EP();
    await deleteIndex(TEST_INDEX);
    const createRes = await fetch(`${esEp}/${TEST_INDEX}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mappings: {
          properties: {
            content: { type: 'text' },
            content_vector: { type: 'dense_vector', dims, index: true, similarity: 'cosine' },
          },
        },
      }),
    });
    expect(createRes.ok).toBe(true);

    // 3. Index both docs (simulates what reindex writes)
    const bulkBody = [
      JSON.stringify({ index: { _index: TEST_INDEX, _id: 'doc1' } }),
      JSON.stringify({ content: text1, content_vector: vec1 }),
      JSON.stringify({ index: { _index: TEST_INDEX, _id: 'doc2' } }),
      JSON.stringify({ content: text2, content_vector: vec2 }),
    ].join('\n') + '\n';

    const bulkRes = await fetch(`${esEp}/_bulk?refresh=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: bulkBody,
    });
    expect(bulkRes.ok).toBe(true);

    // 4. Embed a query semantically close to doc1
    const queryVec = await client.integrations.Core.vector('ocean ecosystem and reef fish');
    expect(Array.isArray(queryVec)).toBe(true);

    // 5. knn search against the reindexed vector index
    const searchRes = await fetch(`${esEp}/${TEST_INDEX}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        knn: {
          field: 'content_vector',
          query_vector: queryVec,
          k: 2,
          num_candidates: 10,
        },
      }),
    });
    expect(searchRes.ok).toBe(true);
    const searchData: any = await searchRes.json();
    const hits: any[] = searchData.hits?.hits || [];

    // 6. The top result should be doc1 (marine / reef topic)
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]._id).toBe('doc1');
    // Score must be a valid cosine similarity in (0, 1]
    expect(hits[0]._score).toBeGreaterThan(0);
    expect(hits[0]._score).toBeLessThanOrEqual(1);
  });
});
