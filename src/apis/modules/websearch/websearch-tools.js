/**
 * Websearch tools — standalone web search via Ollama's OpenAI-compatible API.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but that
 * package is not installed in this project. The function below is the one that
 * was previously inlined in `apis/client.ts` and is the actually-used
 * implementation — it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */
/**
 * Standalone webSearch — calls Ollama's OpenAI-compatible /v1/chat/completions
 * endpoint. Returns the accumulated assistant content string.
 */
export async function webSearch(opts) {
    const { prompt, model: requestedModel = null, ollamaEndpoints, defaultModel, } = opts || {};
    if (!prompt)
        throw new Error('webSearch requires a "prompt" parameter.');
    const host = ollamaEndpoints[1] || ollamaEndpoints[0] || 'http://localhost:11434';
    const useModel = requestedModel || defaultModel || 'qwen3:0.6b';
    const messages = [{ role: 'user', content: prompt }];
    const res = await fetch(`${host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: useModel, messages, stream: false, think: true }),
    });
    if (!res.ok)
        throw new Error(`webSearch error: ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
}
