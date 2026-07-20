/**
 * Persona embedding utilities.
 *
 * sanitizePersonaForEmbedding — converts the relevant persona fields
 * into a normalized, lowercase string suitable for producing small
 * semantic embeddings (nomic-embed-text / all-minilm etc.).
 *
 * Fields used:
 *   name, category, voice_profile.vocabulary, tags, expertise_areas
 */
export interface PersonaEmbeddingInput {
    name?: string;
    category?: string;
    tags?: string[];
    expertise_areas?: string[];
    voice_profile?: {
        vocabulary?: string[];
        [key: string]: any;
    };
    [key: string]: any;
}
/**
 * Builds a clean, lowercase embedding string from a persona document.
 * Returns an empty string if no usable fields are found.
 */
export declare function sanitizePersonaForEmbedding(persona: PersonaEmbeddingInput): string;
/**
 * Dense-vector mapping block to append to the Persona index clone.
 * dims: 384 matches nomic-embed-text / all-minilm-l6-v2 output.
 */
export declare const PERSONA_VECTOR_MAPPING: {
    embedding: {
        type: string;
        dims: number;
        index: boolean;
        similarity: string;
        index_options: {
            type: string;
            m: number;
            ef_construction: number;
        };
    };
};
