/**
 * Jest test for client.integrations.Core.vector()
 * No fetch mocking — every test hits the real Ollama /v1/embeddings endpoint.
 */
import { createClient, config } from '../client';
import { modelRouter } from '../lib/model-router';
const EP = 'http://127.0.0.1:11434';
jest.setTimeout(60000);
async function checkEndpoint() {
    try {
        const res = await fetch(`${EP}/v1/models`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
    }
    catch (e) {
        throw new Error(`Ollama unreachable at ${EP}: ${e.message}`);
    }
}
describe('client.integrations.Core.vector', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));
        modelRouter.invalidateCache();
        localStorage.setItem('model_router_capability_cache', JSON.stringify({ endpoint: EP, map: {}, ts: Date.now() }));
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
        expect(vec.length).toBeGreaterThan(0);
        expect(vec.every((v) => typeof v === 'number' && Number.isFinite(v))).toBe(true);
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
        expect(v1.length).toBe(v2.length);
        const same = v1.every((val, i) => Math.abs(val - v2[i]) < 1e-6);
        expect(same).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// Reindex → vector search integration
// ---------------------------------------------------------------------------
const ES_EP = 'http://127.0.0.1:9200';
const TEST_INDEX = 'test-vector-reindex-search';
async function checkElasticsearch() {
    try {
        const res = await fetch(`${ES_EP}/_cluster/health`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
    }
    catch (e) {
        throw new Error(`Elasticsearch unreachable at ${ES_EP}: ${e.message}`);
    }
}
async function deleteIndex(index) {
    await fetch(`${ES_EP}/${index}`, { method: 'DELETE' }).catch(() => { });
}
describe('reindex → vector search', () => {
    beforeAll(async () => {
        await checkElasticsearch().catch(() => { });
        await checkEndpoint().catch(() => { });
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
        const dims = vec1.length;
        // 2. Create the target vector index with dense_vector mapping
        await deleteIndex(TEST_INDEX);
        const createRes = await fetch(`${ES_EP}/${TEST_INDEX}`, {
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
        const bulkRes = await fetch(`${ES_EP}/_bulk?refresh=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-ndjson' },
            body: bulkBody,
        });
        expect(bulkRes.ok).toBe(true);
        // 4. Embed a query semantically close to doc1
        const queryVec = await client.integrations.Core.vector('ocean ecosystem and reef fish');
        expect(Array.isArray(queryVec)).toBe(true);
        // 5. knn search against the reindexed vector index
        const searchRes = await fetch(`${ES_EP}/${TEST_INDEX}/_search`, {
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
        const searchData = await searchRes.json();
        const hits = searchData.hits?.hits || [];
        // 6. The top result should be doc1 (marine / reef topic)
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]._id).toBe('doc1');
        // Score must be a valid cosine similarity in (0, 1]
        expect(hits[0]._score).toBeGreaterThan(0);
        expect(hits[0]._score).toBeLessThanOrEqual(1);
    });
});
