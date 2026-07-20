/**
 * Persistent Conversation Memory — RAG over past chat turns.
 *
 * Embeds chat turns via /v1/embeddings and stores them in ES dense_vector index.
 * recallMemory() uses ES kNN search to surface the most relevant past turns.
 * buildMemoryContext() returns a ready-to-inject system message string.
 */
export interface MemoryTurn {
    user_email: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    vector?: number[];
    created_date?: string;
}
export interface MemoryRecall {
    id: string;
    score: number;
    role: string;
    content: string;
    session_id: string;
    created_date: string;
}
/** Embed and persist a chat turn to cross-session memory. */
export declare function saveMemory(turn: Omit<MemoryTurn, 'vector' | 'created_date'>, ollamaEndpoints: string[], embeddingModel?: string): Promise<void>;
/** Recall top-K semantically similar past turns via ES kNN search. */
export declare function recallMemory(userEmail: string, queryText: string, ollamaEndpoints: string[], embeddingModel?: string, topK?: number): Promise<MemoryRecall[]>;
/**
 * Build a ready-to-inject system message from recalled memories.
 * Returns null when no relevant memories exist.
 */
export declare function buildMemoryContext(userEmail: string, queryText: string, ollamaEndpoints: string[], embeddingModel?: string, topK?: number): Promise<string | null>;
/** Delete all memory turns for a user. */
export declare function clearMemory(userEmail: string): Promise<void>;
