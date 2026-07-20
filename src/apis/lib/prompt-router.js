/**
 * Prompt Router
 * Uses the modelRouter to pick the best model for a task, then calls the
 * Ollama OpenAI-compatible /v1/chat/completions endpoint to enhance a raw
 * input into a richer, more specific prompt (optionally persona-aware).
 *
 * Exposed on the client as `client.promptRouter`.
 */
import { modelRouter } from './model-router';
import { endpointRegistry } from './endpoint-registry';
const getEndpoint = () => endpointRegistry.ollama();
function getDefaultModel() {
    try {
        const ls = typeof localStorage !== 'undefined' ? localStorage : null;
        return (ls && (ls.getItem('ollama_default_model') || ls.getItem('prompthub_default_model'))) || 'qwen3:0.6b';
    }
    catch {
        return 'qwen3:0.6b';
    }
}
/** Resolve the best model for a task via modelRouter, with sensible defaults */
/** Resolve the best model via modelRouter, plumbing all routing options */
function resolveModel(opts) {
    return modelRouter.resolve({
        TaskType: opts.TaskType ?? 'chat',
        Speed: opts.Speed ?? 100,
        defaultModel: opts.model?.trim() || opts.defaultModel || getDefaultModel(),
        requiredCaps: opts.requiredCaps,
    });
}
/** Build the system prompt for the enhancement call */
function buildSystemPrompt(persona) {
    const base = 'You are a prompt enhancement expert. Rewrite the user\'s rough input into a clear, specific, richly-detailed prompt for AI generation. STRICT RULE: Output the enhanced prompt directly and nothing else — no greetings, no questions, no meta-commentary, no asking for clarification, no "here is your enhanced prompt". Just the enhanced text.';
    if (!persona)
        return base;
    const ctx = persona.name
        ? `You are helping ${persona.name} (${persona.description || 'an expert'}).`
        : '';
    const instr = persona.instructions?.trim() ? ` Follow these guidelines: ${persona.instructions.trim()}` : '';
    return `${ctx} ${base}${instr}`;
}
export const promptRouter = {
    /**
     * Enhance a raw prompt using the OpenAI-style API.
     * Routes the best model for the given task via modelRouter.
     * Falls back to the raw prompt on any error (never throws).
     */
    async enhance(raw, opts = {}) {
        const model = resolveModel(opts);
        const endpoint = (opts.endpoint || getEndpoint()).replace(/\/$/, '');
        const system = buildSystemPrompt(opts.persona);
        try {
            const res = await fetch(`${endpoint}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: raw },
                    ],
                    stream: false,
                    temperature: opts.temperature ?? 0.7,
                    max_tokens: opts.maxTokens ?? 1024,
                }),
                signal: opts.signal,
            });
            if (!res.ok)
                throw new Error(`enhance HTTP ${res.status}`);
            const data = await res.json();
            const enhanced = data?.choices?.[0]?.message?.content?.trim();
            return enhanced || raw;
        }
        catch {
            return raw;
        }
    },
};
