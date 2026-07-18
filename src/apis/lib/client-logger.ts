/**
 * Structured Request/Response Logger (Improvement #4)
 * Middleware logger for tracking requests, responses, execution time, and errors.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  durationMs?: number;
}

const formatEntry = (entry: LogEntry): string =>
  `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${
    entry.durationMs != null ? ` (${entry.durationMs}ms)` : ''
  }${entry.context ? ` | ${JSON.stringify(entry.context)}` : ''}`;

// Set to true by jest.setup.after.ts after all tests complete to suppress post-teardown logging.
// Using a mutable object property ensures the flag is live across all module-system transforms
// (export let bindings can break under ts-jest ESM interop).
export const jestState = { tornDown: false };
export const markJestTornDown = () => { jestState.tornDown = true; };

export const clientLogger = {
  log(level: LogLevel, message: string, context?: Record<string, any>, durationMs?: number) {
    // Client logger is silenced — no console output in any environment.
    return;
  },

  info: (msg: string, ctx?: Record<string, any>) => clientLogger.log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, any>) => clientLogger.log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, any>) => clientLogger.log('error', msg, ctx),

  timed: async <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>): Promise<T> => {
    const start = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      clientLogger.log('info', label, ctx, durationMs);

      // Ollama communication summary — mirrors what getMessages would show
      const isOllamaCall = ['InvokeLLM', 'InvokeLLMBatched', 'expandQuery', 'vision.send',
        'vector', 'streamResponse-vision', 'promptRouter', 'websearch', 'toolbox'].some(k => label.includes(k));
      if (isOllamaCall) {
        const msgSummary: Record<string, any> = { call: label, durationMs };
        if (ctx?.model) msgSummary.model = ctx.model;
        if (ctx?.key)   msgSummary.key   = ctx.key;
        // Extract content preview from result if it's a string or has choices
        if (typeof result === 'string' && result.length > 0) {
          msgSummary.responsePreview = result.slice(0, 120) + (result.length > 120 ? '…' : '');
        } else if (result && typeof result === 'object') {
          const r = result as any;
          const content = r?.choices?.[0]?.message?.content ?? r?.content ?? null;
          if (typeof content === 'string') {
            msgSummary.responsePreview = content.slice(0, 120) + (content.length > 120 ? '…' : '');
          }
        }
        clientLogger.log('info', `[ollama-comm] ${label}`, msgSummary);
      }

      return result;
    } catch (err: any) {
      clientLogger.log('error', `${label} FAILED`, { ...ctx, error: err?.message }, Date.now() - start);
      throw err;
    }
  },
};