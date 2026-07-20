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
export declare function trackedOllamaFetch(url: string, init: RequestInit, label?: string): Promise<Response>;
