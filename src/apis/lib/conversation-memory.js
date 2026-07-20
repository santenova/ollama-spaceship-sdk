/**
 * Persistent Conversation Memory — RAG over past chat turns.
 *
 * Embeds chat turns via /v1/embeddings and stores them in ES dense_vector index.
 * recallMemory() uses ES kNN search to surface the most relevant past turns.
 * buildMemoryContext() returns a ready-to-inject system message string.
 */
import { getEsConfig, ensureEsIndex } from './es-entities';
import { embedText } from './openai-fetch';
const MEMORY_INDEX = 'sample-prompt-memory';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
async function ensureMemoryIndex(endpoint, dims) {
    await ensureEsIndex(endpoint, MEMORY_INDEX, {
        mappings: {
            properties: {
                user_email: { type: 'keyword' },
                session_id: { type: 'keyword' },
                role: { type: 'keyword' },
                content: { type: 'text' },
                created_date: { type: 'date' },
                vector: { type: 'dense_vector', dims, index: true, similarity: 'cosine' },
            },
        },
    });
}
/** Embed and persist a chat turn to cross-session memory. */
export async function saveMemory(turn, ollamaEndpoints, embeddingModel = DEFAULT_EMBED_MODEL) {
    const cfg = getEsConfig();
    const vector = await embedText(ollamaEndpoints, embeddingModel, turn.content);
    if (!vector)
        return;
    await ensureMemoryIndex(cfg.endpoint, vector.length);
    await fetch(`${cfg.endpoint}/${MEMORY_INDEX}/_doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...turn, vector, created_date: new Date().toISOString() }),
    });
}
/** Recall top-K semantically similar past turns via ES kNN search. */
export async function recallMemory(userEmail, queryText, ollamaEndpoints, embeddingModel = DEFAULT_EMBED_MODEL, topK = 5) {
    const cfg = getEsConfig();
    const queryVector = await embedText(ollamaEndpoints, embeddingModel, queryText);
    if (!queryVector)
        return [];
    const res = await fetch(`${cfg.endpoint}/${MEMORY_INDEX}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            knn: {
                field: 'vector',
                query_vector: queryVector,
                k: topK,
                num_candidates: topK * 10,
                filter: { term: { user_email: userEmail } },
            },
            _source: ['role', 'content', 'session_id', 'created_date'],
        }),
    });
    if (!res.ok)
        return [];
    const data = await res.json();
    return (data.hits?.hits || []).map((h) => ({
        id: h._id,
        score: h._score,
        role: h._source.role,
        content: h._source.content,
        session_id: h._source.session_id,
        created_date: h._source.created_date,
    }));
}
/**
 * Build a ready-to-inject system message from recalled memories.
 * Returns null when no relevant memories exist.
 */
export async function buildMemoryContext(userEmail, queryText, ollamaEndpoints, embeddingModel = DEFAULT_EMBED_MODEL, topK = 5) {
    const memories = await recallMemory(userEmail, queryText, ollamaEndpoints, embeddingModel, topK);
    if (memories.length === 0)
        return null;
    const lines = memories.map((m, i) => `[Memory ${i + 1} — ${m.role}]: ${m.content.slice(0, 300)}`);
    return ('Relevant past conversation context (most similar to the current query):\n' +
        lines.join('\n') +
        '\n\nUse the above memories to inform your response where relevant.');
}
/** Delete all memory turns for a user. */
export async function clearMemory(userEmail) {
    const cfg = getEsConfig();
    await fetch(`${cfg.endpoint}/${MEMORY_INDEX}/_delete_by_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { term: { user_email: userEmail } } }),
    });
}
