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
export declare const logStore: {
    /** Add a log entry manually. */
    push(entry: LogEntry): void;
    /** Current snapshot of all entries. */
    getEntries(): LogEntry[];
    /** Subscribe to new entries. Returns unsubscribe fn. */
    subscribe(fn: Listener): () => void;
    clear(): void;
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
export declare function patchLogger(logger: PatchableLogger): void;
interface TelemetryEmitter {
    on: (event: string, handler: (payload: Record<string, any>) => void) => () => void;
}
/**
 * Hook into a telemetry emitter so every emitted event also pushes to the store.
 * Returns an unsubscribe function.
 */
export declare function hookTelemetry(telemetry: TelemetryEmitter): () => void;
export {};
