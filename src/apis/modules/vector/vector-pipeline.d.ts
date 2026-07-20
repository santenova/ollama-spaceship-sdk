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
/** Full orchestrator. Returns keywords, matched count, reindex stats, enriched count, mode. */
export declare function vectorPipeline(opts: VectorPipelineOpts): Promise<{
    mode: "single";
    keywords: string[];
    sourceIndex: string;
    targetIndex: string;
    matchedCount: number;
    reindexStats: {
        created: number;
        updated: number;
        srcIndex: string;
    }[];
    enrichedCount: number;
    vectorKey: number[];
    sourceIndices?: undefined;
} | {
    mode: "multi";
    keywords: string[];
    sourceIndices: string[];
    targetIndex: string;
    matchedCount: number;
    reindexStats: any[];
    enrichedCount: number;
    vectorKey: number[];
    sourceIndex?: undefined;
} | {
    mode: "all";
    keywords: string[];
    matchedCount: number;
    reindexStats: {
        srcIndex: string;
        created: number;
        updated: number;
    }[];
    enrichedCount: number;
    targetIndex: string;
    vectorKey: number[];
    sourceIndex?: undefined;
    sourceIndices?: undefined;
}>;
export {};
