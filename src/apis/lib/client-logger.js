/**
 * Structured Request/Response Logger (Improvement #4)
 * Middleware logger for tracking requests, responses, execution time, and errors.
 */
const formatEntry = (entry) => `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${entry.durationMs != null ? ` (${entry.durationMs}ms)` : ''}${entry.context ? ` | ${JSON.stringify(entry.context)}` : ''}`;
// Set to true by jest.setup.after.ts after all tests complete to suppress post-teardown logging.
export let jestTornDown = false;
export const markJestTornDown = () => { jestTornDown = true; };
export const clientLogger = {
    log(level, message, context, durationMs) {
        if (jestTornDown)
            return;
        const entry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            context,
            durationMs,
        };
        const formatted = formatEntry(entry);
        try {
            if (level === 'error')
                console.error(formatted);
            else if (level === 'warn')
                console.warn(formatted);
            else
                console.log(formatted);
        }
        catch {
            // Swallow errors when Jest has already torn down its console buffer
        }
    },
    info: (msg, ctx) => clientLogger.log('info', msg, ctx),
    warn: (msg, ctx) => clientLogger.log('warn', msg, ctx),
    error: (msg, ctx) => clientLogger.log('error', msg, ctx),
    timed: async (label, fn, ctx) => {
        const start = Date.now();
        try {
            const result = await fn();
            const durationMs = Date.now() - start;
            clientLogger.log('info', label, ctx, durationMs);
            // Ollama communication summary — mirrors what getMessages would show
            const isOllamaCall = ['InvokeLLM', 'InvokeLLMBatched', 'expandQuery', 'vision.send',
                'vector', 'streamResponse-vision', 'promptRouter', 'websearch', 'toolbox'].some(k => label.includes(k));
            if (isOllamaCall) {
                const msgSummary = { call: label, durationMs };
                if (ctx?.model)
                    msgSummary.model = ctx.model;
                if (ctx?.key)
                    msgSummary.key = ctx.key;
                // Extract content preview from result if it's a string or has choices
                if (typeof result === 'string' && result.length > 0) {
                    msgSummary.responsePreview = result.slice(0, 120) + (result.length > 120 ? '…' : '');
                }
                else if (result && typeof result === 'object') {
                    const r = result;
                    const content = r?.choices?.[0]?.message?.content ?? r?.content ?? null;
                    if (typeof content === 'string') {
                        msgSummary.responsePreview = content.slice(0, 120) + (content.length > 120 ? '…' : '');
                    }
                }
                clientLogger.log('info', `[ollama-comm] ${label}`, msgSummary);
            }
            return result;
        }
        catch (err) {
            clientLogger.log('error', `${label} FAILED`, { ...ctx, error: err?.message }, Date.now() - start);
            throw err;
        }
    },
};
