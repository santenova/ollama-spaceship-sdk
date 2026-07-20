/**
 * Integration test: Persona vector index pipeline
 *
 * Flow:
 *   1. Create a fresh client + get the esEntity for Persona
 *   2. Clone the Persona index to {prefix}-persona-vector with
 *      the dense_vector "embedding" field appended
 *   3. Sanitize each persona doc and embed it via client.integrations.Core.vector()
 *   4. Bulk-write enriched docs to the new index
 *   5. Validate with three knn neighbour searches against the
 *      Marine Biologist persona:
 *        a) closest / farthest by expertise_areas
 *        b) closest / farthest by tags
 *        c) closest / farthest by voice_profile.vocabulary
 *
 * Requires: Ollama @ 127.0.0.1:11434, Elasticsearch @ 127.0.0.1:9200
 */
export {};
