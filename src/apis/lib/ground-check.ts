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

import { getEsConfig } from './es-entities';
import { embedText, chatCompletion, cosineSimilarity } from './openai-fetch';
import { telemetry } from './telemetry';

export interface GroundCheckResult {
  /** Overall grounding confidence (0 = fully hallucinated, 1 = fully grounded). */
  confidence: number;
  /** List of unsupported claims flagged by the LLM judge. */
  flags: string[];
  /** Per-source cosine similarity scores (same order as sourceDocIds). */
  sourcesSimilarity: number[];
}

/**
 * Fetch a document's text content from any ES index by document ID.
 * Tries VectorDocument first, then all configured indices.
 */
async function fetchDocText(docId: string, esEndpoint: string): Promise<string | null> {
  // Search every configured ES index so grounding works against any stored document,
  // not just a hardcoded subset. VectorDocument is always included as a default source.
  const configured = Object.values(getEsConfig().indices || {});
  const indices = Array.from(new Set(['sample-prompt-vectordocument', ...configured]));
  for (const index of indices) {
    try {
      const res = await fetch(`${esEndpoint}/${index}/_doc/${docId}`);
      if (res.ok) {
        const data: any = await res.json();
        const src = data._source || {};
        return src.content || src.description || src.instructions || src.body || null;
      }
    } catch {}
  }
  return null;
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
export async function groundCheck(
  response: string,
  sourceDocIds: string[],
  ollamaEndpoints: string[],
  model: string,
  embeddingModel = 'nomic-embed-text',
): Promise<GroundCheckResult> {
  const cfg = getEsConfig();

  // 1. Fetch source document texts
  const sourceTexts = await Promise.all(
    sourceDocIds.map(id => fetchDocText(id, cfg.endpoint)),
  );
  const validSources = sourceTexts.filter(Boolean) as string[];

  if (validSources.length === 0) {
    return { confidence: 0.5, flags: ['No source documents could be retrieved'], sourcesSimilarity: [] };
  }

  // 2. Embed response and all sources in parallel
  const [responseVec, ...sourceVecs] = await Promise.all([
    embedText(ollamaEndpoints, embeddingModel, response.slice(0, 2000)),
    ...validSources.map(src => embedText(ollamaEndpoints, embeddingModel, src.slice(0, 2000))),
  ]);

  const sourcesSimilarity: number[] = [];
  if (responseVec) {
    for (const srcVec of sourceVecs) {
      sourcesSimilarity.push(srcVec ? cosineSimilarity(responseVec, srcVec) : 0);
    }
  }

  // Mean cosine similarity as a base confidence signal
  const meanSim = sourcesSimilarity.length > 0
    ? sourcesSimilarity.reduce((a, b) => a + b, 0) / sourcesSimilarity.length
    : 0.5;

  // 3. LLM judge — flag unsupported claims
  const schema = {
    type: 'object',
    properties: {
      flags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific claims in the response that are NOT supported by the sources. Empty array if fully grounded.',
      },
      confidence: {
        type: 'number',
        description: 'Overall grounding confidence 0.0-1.0 based on source support.',
      },
    },
    required: ['flags', 'confidence'],
  };

  const sourceSummaries = validSources.map((s, i) => `Source ${i + 1}: ${s.slice(0, 400)}`).join('\n\n');
  const judgePrompt = `You are a hallucination detection expert for legal, medical, and compliance contexts.

SOURCES:
${sourceSummaries}

RESPONSE TO VERIFY:
"""
${response.slice(0, 1500)}
"""

Task: Identify any specific claims in the response that are NOT supported by the sources above. Be precise — quote the problematic phrase. If the response is fully grounded, return an empty flags array. Also provide an overall confidence score (0 = fully hallucinated, 1 = fully grounded).`;

  let llmFlags: string[] = [];
  let llmConfidence = meanSim;

  try {
    const result = await chatCompletion(
      ollamaEndpoints,
      model,
      [{ role: 'user', content: judgePrompt }],
      { response_json_schema: schema, temperature: 0 },
    );
    if (result && typeof result === 'object') {
      llmFlags = Array.isArray(result.flags) ? result.flags : [];
      llmConfidence = typeof result.confidence === 'number' ? result.confidence : meanSim;
    }
  } catch {}

  // Blend vector similarity (40%) + LLM judge confidence (60%)
  const blendedConfidence = parseFloat(((meanSim * 0.4) + (llmConfidence * 0.6)).toFixed(3));

  telemetry.emit('ground-check:complete', {
    docCount: sourceDocIds.length,
    flagCount: llmFlags.length,
    confidence: blendedConfidence,
  });

  return {
    confidence: blendedConfidence,
    flags: llmFlags,
    sourcesSimilarity,
  };
}