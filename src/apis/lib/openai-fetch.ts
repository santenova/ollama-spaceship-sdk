/**
 * Shared thin wrapper for OpenAI-API-style calls to any local Ollama endpoint.
 * All feature modules import from here — no circular dep on client.ts.
 */

/** Pick the first non-empty endpoint from the list. */
export function resolveEndpoint(ollamaEndpoints: string[]): string {
  return (ollamaEndpoints.find(e => !!e) || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

/** POST to /v1/chat/completions and return parsed response text (or JSON). */
export async function chatCompletion(
  ollamaEndpoints: string[],
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts: {
    temperature?: number;
    max_tokens?: number;
    response_json_schema?: Record<string, any> | null;
    signal?: AbortSignal;
  } = {},
): Promise<string | any> {
  const result = await chatCompletionWithUsage(ollamaEndpoints, model, messages, opts);
  if (opts.response_json_schema) {
    try { return JSON.parse(result.content); } catch { return result.content; }
  }
  return result.content;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResult {
  content: string;
  usage: ChatCompletionUsage | null;
}

/** POST to /v1/chat/completions and return content + token usage metadata. */
export async function chatCompletionWithUsage(
  ollamaEndpoints: string[],
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts: {
    temperature?: number;
    max_tokens?: number;
    response_json_schema?: Record<string, any> | null;
    signal?: AbortSignal;
  } = {},
): Promise<ChatCompletionResult> {
  const endpoint = resolveEndpoint(ollamaEndpoints);
  const body: Record<string, any> = { model, messages, stream: false };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.max_tokens !== undefined) body.max_tokens = opts.max_tokens;
  if (opts.response_json_schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'response', schema: opts.response_json_schema, strict: false },
    };
  }

  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`chatCompletion ${res.status}: ${err}`);
  }

  const data: any = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  const usageRaw = data?.usage;
  const usage: ChatCompletionUsage | null = usageRaw
    ? {
        prompt_tokens: usageRaw.prompt_tokens ?? 0,
        completion_tokens: usageRaw.completion_tokens ?? 0,
        total_tokens: usageRaw.total_tokens ?? 0,
      }
    : null;

  return { content, usage };
}

/** POST to /v1/embeddings and return the embedding vector. */
export async function embedText(
  ollamaEndpoints: string[],
  model: string,
  text: string,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (!text?.trim()) return null;
  const endpoint = resolveEndpoint(ollamaEndpoints);
  const res = await fetch(`${endpoint}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
    signal,
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  return data?.data?.[0]?.embedding ?? data?.embedding ?? null;
}

/**
 * Parse an SSE (Server-Sent Events) response body, calling `onToken` for each
 * content delta. Used by invokeLLM, streamResponse, and ollama-tracker.
 *
 * Usage:
 *   await parseSSE(res, (delta) => { content += delta; onToken?.(delta); });
 */
export async function parseSSE(
  res: Response,
  onToken: (delta: string) => void,
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta?.content ?? '';
        if (delta) onToken(delta);
      } catch { /* skip malformed chunk */ }
    }
  }
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}