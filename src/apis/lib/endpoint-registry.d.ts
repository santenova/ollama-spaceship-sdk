/**
 * EndpointRegistry — singleton that resolves and caches Ollama / ES endpoints (#2)
 * Eliminates duplicated localStorage reads across client.ts, app-params.ts, etc.
 */
export declare const endpointRegistry: {
    /** Primary Ollama endpoint (string) */
    ollama(): string;
    /** All Ollama endpoints (array) */
    ollamaAll(): string[];
    /** Elasticsearch / vector-cloud endpoint */
    elasticsearch(): string;
    /**
     * Update endpoints at runtime (e.g. after user saves Config page).
     * Persists to localStorage and invalidates the in-memory cache.
     */
    update(partial: Partial<{
        ollama: string[];
        elasticsearch: string;
    }>): void;
    /** Invalidate cache (e.g. for tests) */
    invalidate(): void;
};
