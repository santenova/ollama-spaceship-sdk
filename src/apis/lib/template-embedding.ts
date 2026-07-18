/**
 * Template embedding utilities.
 *
 * sanitizeTemplateForEmbedding — converts the relevant template fields
 * into a normalized, lowercase string suitable for producing small
 * semantic embeddings (nomic-embed-text / all-minilm etc.).
 *
 * Fields used:
 *   title, category, voice_profile.vocabulary, tags, expertise_areas
 */

export interface TemplateEmbeddingInput {
  title?: string;
  category?: string;
  tags?: string[];
  subcategory?: string;
  voice_profile?: {
    vocabulary?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Builds a clean, lowercase embedding string from a template document.
 * Returns an empty string if no usable fields are found.
 */
export function sanitizeTemplateForEmbedding(template: TemplateEmbeddingInput): string {
  const parts: string[] = [];

  if (template.title?.trim()) {
    parts.push(`title: ${template.title.trim()}`);
  }
  if (template.category?.trim()) {
    parts.push(`category: ${template.category.trim()}`);
  }

  if (template.subcategory?.trim()) {
    parts.push(`subcategory: ${template.subcategory.trim()}`);
  }

  const tags = (template.tags || []).filter(Boolean);
  if (tags.length) {
    parts.push(`tags: ${tags.join(' ')}`);
  }
  const vocab = (template.voice_profile?.vocabulary || []).filter(Boolean);
  if (vocab.length) {
    parts.push(`vocabulary: ${vocab.join(' ')}`);
  }

  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Dense-vector mapping block to append to the Template index clone.
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
