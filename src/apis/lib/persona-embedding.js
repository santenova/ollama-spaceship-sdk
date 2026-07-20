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
/**
 * Builds a clean, lowercase embedding string from a persona document.
 * Returns an empty string if no usable fields are found.
 */
export function sanitizePersonaForEmbedding(persona) {
    const parts = [];
    if (persona.name?.trim()) {
        parts.push(`name: ${persona.name.trim()}`);
    }
    if (persona.category?.trim()) {
        parts.push(`category: ${persona.category.trim()}`);
    }
    const expertise = (persona.expertise_areas || []).filter(Boolean);
    if (expertise.length) {
        parts.push(`expertise: ${expertise.join(' ')}`);
    }
    const tags = (persona.tags || []).filter(Boolean);
    if (tags.length) {
        parts.push(`tags: ${tags.join(' ')}`);
    }
    const vocab = (persona.voice_profile?.vocabulary || []).filter(Boolean);
    if (vocab.length) {
        parts.push(`vocabulary: ${vocab.join(' ')}`);
    }
    return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}
/**
 * Dense-vector mapping block to append to the Persona index clone.
 * dims: 384 matches nomic-embed-text / all-minilm-l6-v2 output.
 */
export const PERSONA_VECTOR_MAPPING = {
    embedding: {
        type: 'dense_vector',
        dims: 768,
        index: true,
        similarity: 'cosine',
        index_options: {
            type: 'int8_hnsw',
            m: 16,
            ef_construction: 100,
        },
    },
};
