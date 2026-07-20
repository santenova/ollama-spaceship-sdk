/**
 * Thinking enabled — non-streaming request with thinking trace via Ollama's
 * OpenAI-compatible /v1/chat/completions endpoint.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below mirrors
 * the pattern used by the other modules: plain `fetch` so it works in both
 * browser and Node.
 */
/**
 * Sends a prompt with think:true and returns both the thinking trace and
 * the final content. Non-streaming.
 */
export async function thinkingEnabled(prompt, config) {
    const host = config.ollamaEndpoints[1] ||
        config.ollamaEndpoints[0] ||
        'http://localhost:11434';
    const useModel = config.model || config.defaultModel || 'qwen3:0.6b';
    const res = await fetch(`${host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: useModel,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            think: true,
        }),
    });
    if (!res.ok) {
        throw new Error(`thinkingEnabled error: ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const data = await res.json();
    const message = data?.choices?.[0]?.message ?? {};
    return {
        thinking: message.thinking ?? '',
        content: message.content ?? '',
    };
}
