/**
 * Global telemetry/client-log store.
 * Collects entries from both clientLogger and the telemetry emitter.
 * Any component can subscribe to updates.
 */

interface LogEntry {
  level: string;
  message: string;
  timestamp?: string;
  context?: Record<string, any>;
  durationMs?: number;
  id?: string;
}

type Listener = (entries: LogEntry[]) => void;

let entries: LogEntry[] = [];
const listeners = new Set<Listener>();
const MAX_ENTRIES = 200;

function notify() {
  listeners.forEach(fn => { try { fn(entries); } catch {} });
}

export const logStore = {
  /** Add a log entry manually. */
  push(entry: LogEntry) {
    entries = [{
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    }, ...entries.slice(0, MAX_ENTRIES - 1)];
    notify();
  },

  /** Current snapshot of all entries. */
  getEntries(): LogEntry[] {
    return entries;
  },

  /** Subscribe to new entries. Returns unsubscribe fn. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(entries); // immediate snapshot
    return () => { listeners.delete(fn); };
  },

  clear() {
    entries = [];
    notify();
  },
};

interface PatchableLogger {
  log: (level: string, message: string, context?: Record<string, any>, durationMs?: number) => void;
  info: (msg: string, ctx?: Record<string, any>) => void;
  warn: (msg: string, ctx?: Record<string, any>) => void;
  error: (msg: string, ctx?: Record<string, any>) => void;
  timed: <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>) => Promise<T>;
  _patched?: boolean;
  [key: string]: any;
}

/**
 * Hook into a clientLogger instance so every call also pushes to the store.
 * Mutates the logger in place (adds a `_patched` flag to avoid double-patching).
 */
export function patchLogger(logger: PatchableLogger) {
  if (logger._patched) return;
  const methods = ['log', 'info', 'warn', 'error'] as const;
  methods.forEach(m => {
    const original = logger[m].bind(logger);
    (logger as any)[m] = (...args: any[]) => {
      const msg = typeof args[0] === 'string' ? args[0] : '';
      const ctx = typeof args[1] === 'object' ? args[1] : undefined;
      const level = m === 'log' ? (args[0] === 'warn' ? 'warn' : args[0] === 'error' ? 'error' : 'info') : m;
      logStore.push({ level, message: msg, context: ctx });
      original(...args);
    };
  });
  const origTimed = logger.timed.bind(logger);
  (logger as any).timed = async (label: string, fn: () => Promise<any>, ctx?: Record<string, any>) => {
    const start = Date.now();
    try {
      const result = await fn();
      logStore.push({ level: 'info', message: label, durationMs: Date.now() - start, context: ctx });
      return result;
    } catch (err: any) {
      logStore.push({ level: 'error', message: `${label} FAILED`, durationMs: Date.now() - start, context: { ...ctx, error: err?.message } });
      throw err;
    }
  };
  logger._patched = true;
}

interface TelemetryEmitter {
  on: (event: string, handler: (payload: Record<string, any>) => void) => () => void;
}

/**
 * Hook into a telemetry emitter so every emitted event also pushes to the store.
 * Returns an unsubscribe function.
 */
export function hookTelemetry(telemetry: TelemetryEmitter): () => void {
  const events = [
    'client:request-start',
    'client:request-end',
    'client:fallback-triggered',
    'client:circuit-open',
    'client:circuit-closed',
    'client:model-routed',
    'client:error',
    'app:page-view',
    'app:nav-click',
    'app:action',
    'persona:autosuggest-request',
    'persona:autosuggest-keywords',
    'persona:autosuggest-search',
  ];
  const unsubs = events.map(event =>
    telemetry.on(event, payload => {
      logStore.push({ level: 'debug', message: event, context: payload, durationMs: payload?.durationMs });
    })
  );
  return () => unsubs.forEach(fn => fn());
}