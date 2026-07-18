/**
 * Global telemetry/client-log store.
 * Collects entries from both clientLogger and the telemetry emitter.
 * Any component can subscribe to updates.
 */

let entries = [];
const listeners = new Set();
const MAX_ENTRIES = 200;

function notify() {
  listeners.forEach(fn => { try { fn(entries); } catch {} });
}

export const logStore = {
  /** Add a log entry manually. */
  push(entry) {
    entries = [...entries.slice(-(MAX_ENTRIES - 1)), {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    }];
    notify();
  },

  /** Current snapshot of all entries. */
  getEntries() {
    return entries;
  },

  /** Subscribe to new entries. Returns unsubscribe fn. */
  subscribe(fn) {
    listeners.add(fn);
    fn(entries); // immediate snapshot
    return () => { listeners.delete(fn); };
  },

  clear() {
    entries = [];
    notify();
  },
};

/**
 * Hook into a clientLogger instance so every call also pushes to the store.
 * Mutates the logger in place (adds a `_patched` flag to avoid double-patching).
 */
export function patchLogger(logger) {
  if (logger._patched) return;
  const methods = ['log', 'info', 'warn', 'error'];
  methods.forEach(m => {
    const original = logger[m].bind(logger);
    logger[m] = (...args) => {
      // Push to store
      const msg = typeof args[0] === 'string' ? args[0] : '';
      const ctx = typeof args[1] === 'object' ? args[1] : undefined;
      const level = m === 'log' ? (args[0] === 'warn' ? 'warn' : args[0] === 'error' ? 'error' : 'info') : m;
      logStore.push({ level, message: msg, context: ctx });
      // Call original
      original(...args);
    };
  });
  // Also patch `timed`
  const origTimed = logger.timed.bind(logger);
  logger.timed = async (label, fn, ctx) => {
    const start = Date.now();
    try {
      const result = await fn();
      logStore.push({ level: 'info', message: label, durationMs: Date.now() - start, context: ctx });
      return result;
    } catch (err) {
      logStore.push({ level: 'error', message: `${label} FAILED`, durationMs: Date.now() - start, context: { ...ctx, error: err?.message } });
      throw err;
    }
  };
  logger._patched = true;
}

/**
 * Hook into a telemetry emitter so every emitted event also pushes to the store.
 * Returns an unsubscribe function.
 */
export function hookTelemetry(telemetry) {
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
  ];
  const unsubs = events.map(event =>
    telemetry.on(event, payload => {
      logStore.push({ level: 'debug', message: event, context: payload, durationMs: payload?.durationMs });
    })
  );
  return () => unsubs.forEach(fn => fn());
}