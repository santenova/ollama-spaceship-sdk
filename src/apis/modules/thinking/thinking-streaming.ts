/**
 * Thinking streaming — streams thoughts and responses from the LLM using
 * vanilla fetch against Ollama's OpenAI-compatible /v1/chat/completions
 * endpoint with SSE parsing.
 *
 * The previous version of this file used the `ollama` npm SDK and
 * `process.stdout.write`, neither of which work in the browser. The
 * function below mirrors the SSE parsing pattern from the test suite and
 * uses plain `fetch` so it works in both browser and Node.
 */

export interface ThinkingStreamingConfig {
  ollamaEndpoints: string[];
  model?: string | null;
  defaultModel?: string;
}

export interface ThinkingStreamingResult {
  thinking: string;
  content: string;
  chunks: number;
}

/**
 * Streams thoughts and responses from the LLM. Returns the accumulated
 * thinking trace and content after the stream closes.
 */
export async function thinkingStreamingFetch(
  prompt: string,
  config: ThinkingStreamingConfig,
): Promise<ThinkingStreamingResult> {
  const host =
    config.ollamaEndpoints[1] ||
    config.ollamaEndpoints[0] ||
    'http://localhost:11434';
  const useModel =
    config.model || config.defaultModel || 'qwen3:0.6b';

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: useModel,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      think: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`thinkingStreamingFetch error: ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let thinkBuf = '';
  let contentBuf = '';
  let chunks = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks++;
    for (const line of decoder.decode(value).split('\n')) {
      const trimmed = line.replace(/^data:\s*/, '').trim();
      if (!trimmed || trimmed === '[DONE]') continue;
      try {
        const json = JSON.parse(trimmed);
        const delta = json?.choices?.[0]?.delta;
        if (delta?.thinking) thinkBuf += delta.thinking;
        if (delta?.content) contentBuf += delta.content;
      } catch {
        // partial JSON across chunk boundaries — skip
      }
    }
  }

  return { thinking: thinkBuf, content: contentBuf, chunks };
}
