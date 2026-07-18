/**
 * Vanilla fetch helpers for OpenAI-compatible Ollama endpoints.
 * Browser-compatible — no ollama SDK, no Node.js APIs.
 */

export function ollamaHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer ollama",
    "ngrok-skip-browser-warning": "true",
  };
}

/**
 * Stream an OpenAI-compatible /v1/chat/completions response.
 * Calls onChunk for each SSE delta: onChunk({ content, thinking, tool_calls, done }).
 * Returns the final accumulated message object.
 */
export async function streamChatCompletion(host, body, onChunk) {
  const res = await fetch(`${host}/v1/chat/completions`, {
    method: "POST",
    headers: ollamaHeaders(),
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama stream ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let fullThinking = "";
  let toolCalls = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((l) => l.startsWith("data:"));
    for (const line of lines) {
      const json = line.replace(/^data:\s*/, "");
      if (json === "[DONE]") continue;
      try {
        const parsed = JSON.parse(json);
        const delta = parsed.choices?.[0]?.delta || {};
        if (delta.content) {
          fullContent += delta.content;
          onChunk?.({ content: fullContent, thinking: fullThinking, tool_calls: toolCalls, done: false });
        }
        if (delta.thinking) {
          fullThinking += delta.thinking;
          onChunk?.({ content: fullContent, thinking: fullThinking, tool_calls: toolCalls, done: false });
        }
        if (delta.tool_calls) {
          toolCalls = [...toolCalls, ...delta.tool_calls];
          onChunk?.({ content: fullContent, thinking: fullThinking, tool_calls: toolCalls, done: false });
        }
      } catch {}
    }
  }
  onChunk?.({ content: fullContent, thinking: fullThinking, tool_calls: toolCalls, done: true });
  return { content: fullContent, thinking: fullThinking, tool_calls: toolCalls };
}

/**
 * Non-streaming chat completion via OpenAI-compatible endpoint.
 */
export async function chatCompletion(host, body) {
  const res = await fetch(`${host}/v1/chat/completions`, {
    method: "POST",
    headers: ollamaHeaders(),
    body: JSON.stringify({ ...body, stream: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${text}`);
  }
  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  return {
    content: message.content || "",
    thinking: message.thinking || "",
    tool_calls: message.tool_calls || [],
  };
}

/**
 * Helper to parse tool call arguments (which may be a JSON string or object).
 */
export function parseToolArgs(args) {
  if (typeof args === "string") {
    try { return JSON.parse(args); } catch { return {}; }
  }
  return args || {};
}