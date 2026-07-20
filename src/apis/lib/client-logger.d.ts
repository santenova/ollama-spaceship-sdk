/**
 * Structured Request/Response Logger (Improvement #4)
 * Middleware logger for tracking requests, responses, execution time, and errors.
 */
type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export declare let jestTornDown: boolean;
export declare const markJestTornDown: () => void;
export declare const clientLogger: {
    log(level: LogLevel, message: string, context?: Record<string, any>, durationMs?: number): void;
    info: (msg: string, ctx?: Record<string, any>) => void;
    warn: (msg: string, ctx?: Record<string, any>) => void;
    error: (msg: string, ctx?: Record<string, any>) => void;
    timed: <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>) => Promise<T>;
};
export {};
