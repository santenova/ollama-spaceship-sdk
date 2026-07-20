/**
 * Hallucination / Grounding Checker
 *
 * After an InvokeLLM call, groundCheck(response, sourceDocIds[]) fetches
 * source docs from ES, embeds both the response and each source via
 * /v1/embeddings, computes cosine similarity, then asks the LLM via
 * /v1/chat/completions to flag any claims not supported by the sources.
 *
 * Returns { confidence: 0-1, flags: string[], sourcesSimilarity: number[] }.
 */
export interface GroundCheckResult {
    /** Overall grounding confidence (0 = fully hallucinated, 1 = fully grounded). */
    confidence: number;
    /** List of unsupported claims flagged by the LLM judge. */
    flags: string[];
    /** Per-source cosine similarity scores (same order as sourceDocIds). */
    sourcesSimilarity: number[];
}
/**
 * Check whether an LLM response is grounded in the provided source documents.
 *
 * @param response       The LLM response text to check.
 * @param sourceDocIds   Array of ES document IDs to use as ground-truth sources.
 * @param ollamaEndpoints  Active Ollama endpoints.
 * @param model          Model to use for the LLM judge call.
 * @param embeddingModel Model to use for embedding (default: nomic-embed-text).
 */
export declare function groundCheck(response: string, sourceDocIds: string[], ollamaEndpoints: string[], model: string, embeddingModel?: string): Promise<GroundCheckResult>;
