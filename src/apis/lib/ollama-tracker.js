/**
 * Ollama request/response tracker.
 *
 * Wraps every fetch to an Ollama endpoint so the actual request body and
 * response payload are visible in the TelemetryOverlay — not just timing.
 *
 * Logs two entries per call:
 *   1. ollama:request  — URL, model, messages preview, stream/think flags
 *   2. ollama:response — status, content preview, tool calls, usage, duration
 *
 * For streaming calls, wraps the body reader to collect token deltas and
 * emits ollama:stream-complete with the full text + token count on finish.
 */
import { telemetry } from './telemetry';
// Static import — telemetryLogStore patches clientLogger independently, no circular dep
import { logStore } from './telemetryLogStore';
function pushEntry(level, message, context, durationMs) {
    logStore.push({ level, message, context, durationMs });
}
// ── Request body summarizer ──────────────────────────────────────────────────
function summarizeRequestBody(rawBody) {
    if (!rawBody)
        return {};
    try {
        const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
        const summary = {};
        if (body.model)
            summary.model = body.model;
        if (body.stream !== undefined)
            summary.stream = body.stream;
        if (body.think !== undefined)
            summary.think = body.think;
        if (body.temperature !== undefined)
            summary.temperature = body.temperature;
        if (body.tools?.length)
            summary.toolCount = body.tools.length;
        if (body.response_format)
            summary.jsonSchema = true;
        if (body.input) {
            summary.input = typeof body.input === 'string'
                ? body.input.slice(0, 300)
                : Array.isArray(body.input)
                    ? `[${body.input.length} items]`
                    : typeof body.input;
        }
        if (body.messages?.length) {
            summary.messageCount = body.messages.length;
            summary.messages = body.messages.map((m) => {
                const entry = { role: m.role };
                if (typeof m.content === 'string') {
                    entry.content = m.content.slice(0, 300);
                }
                else if (Array.isArray(m.content)) {
                    entry.content = `[${m.content.length} parts: ${m.content.map((p) => p.type).join(', ')}]`;
                }
                else {
                    entry.content = typeof m.content;
                }
                return entry;
            });
        }
        return summary;
    }
    catch {
        return { raw: String(rawBody).slice(0, 200) };
    }
}
// ── Response body summarizer ─────────────────────────────────────────────────
function summarizeResponseBody(data) {
    if (!data || typeof data !== 'object')
        return {};
    const summary = {};
    const msg = data.choices?.[0]?.message;
    if (msg?.content)
        summary.content = String(msg.content).slice(0, 500);
    if (msg?.thinking)
        summary.thinking = String(msg.thinking).slice(0, 300);
    if (msg?.tool_calls?.length) {
        summary.toolCalls = msg.tool_calls.map((tc) => ({
            name: tc.function?.name,
            args: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments.slice(0, 200)
                : tc.function?.arguments,
        }));
    }
    if (data.data?.[0]?.embedding) {
        summary.embeddingDims = data.data[0].embedding.length;
        summary.embeddingPreview = data.data[0].embedding.slice(0, 5).map((v) => Number(v.toFixed(4)));
    }
    if (data.model)
        summary.model = data.model;
    if (data.usage)
        summary.usage = data.usage;
    if (data.error)
        summary.error = data.error;
    return summary;
}
// ── Streaming body wrapper ────────────────────────────────────────────────────
// Wraps a ReadableStream so SSE chunks are parsed for content deltas; emits
// ollama:stream-complete when the caller finishes reading the stream.
function wrapStreamingBody(res, url, label, start) {
    if (!res.body)
        return res;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let content = '';
    const tracked = new ReadableStream({
        async pull(controller) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    const durationMs = Date.now() - start;
                    pushEntry('info', `ollama:stream-complete ${label}`, {
                        url,
                        contentPreview: content.slice(0, 500),
                        tokenChars: content.length,
                        durationMs,
                    });
                    telemetry.emit('ollama:stream-complete', { url, label, tokenChars: content.length, durationMs });
                    return;
                }
                // Parse SSE lines to extract content deltas
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf('\n')) >= 0) {
                    const line = buf.slice(0, idx).trim();
                    buf = buf.slice(idx + 1);
                    if (!line || !line.startsWith('data:'))
                        continue;
                    const payload = line.slice(5).trim();
                    if (payload === '[DONE]')
                        continue;
                    try {
                        const chunk = JSON.parse(payload);
                        const delta = chunk?.choices?.[0]?.delta?.content ?? '';
                        if (delta)
                            content += delta;
                    }
                    catch { }
                }
                controller.enqueue(value);
            }
            catch (err) {
                controller.error(err);
            }
        },
        cancel(reason) {
            reader.cancel(reason);
        },
    });
    return new Response(tracked, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
    });
}
// ── Public API ────────────────────────────────────────────────────────────────
export async function trackedOllamaFetch(url, init, label = 'ollama') {
    const start = Date.now();
    const reqSummary = summarizeRequestBody(init?.body);
    const isStream = reqSummary.stream === true;
    pushEntry('info', `ollama:request → ${label}`, { url, method: init?.method || 'POST', ...reqSummary });
    telemetry.emit('ollama:request', { url, label, ...reqSummary });
    try {
        const res = await fetch(url, init);
        if (!res.ok) {
            const durationMs = Date.now() - start;
            const errText = await res.clone().text().catch(() => '');
            pushEntry('error', `ollama:response ${res.status} ${label}`, {
                url, status: res.status, statusText: res.statusText, error: errText.slice(0, 500), durationMs,
            });
            telemetry.emit('ollama:response', { url, label, status: res.status, error: errText.slice(0, 300), durationMs });
            return res;
        }
        // Streaming — wrap the body so we collect tokens as the caller reads
        if (isStream) {
            const durationMs = Date.now() - start;
            pushEntry('info', `ollama:stream-start ${label}`, { url, status: res.status, durationMs });
            return wrapStreamingBody(res, url, label, start);
        }
        // Non-streaming — clone, parse, log the response body
        const clone = res.clone();
        const data = await clone.json().catch(() => null);
        const durationMs = Date.now() - start;
        const resSummary = summarizeResponseBody(data);
        pushEntry('info', `ollama:response ${label}`, { url, status: res.status, ...resSummary, durationMs });
        telemetry.emit('ollama:response', { url, label, status: res.status, ...resSummary, durationMs });
        return res;
    }
    catch (err) {
        const durationMs = Date.now() - start;
        pushEntry('error', `ollama:error ${label}`, { url, error: err?.message, durationMs });
        telemetry.emit('ollama:error', { url, label, error: err?.message, durationMs });
        throw err;
    }
}
