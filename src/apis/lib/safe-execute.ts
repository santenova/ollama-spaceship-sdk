/**
 * Unified error handler / decorator (#1)
 * Wraps any async integration call with consistent logging, telemetry,
 * and circuit-breaker interaction so individual modules stay free of
 * boilerplate try/catch blocks.
 */

import { telemetry } from './telemetry';
import { clientLogger } from './client-logger';

interface SafeExecuteOpts<T> {
  /** Human-readable label used for logging and telemetry events */
  label: string;
  /** The async operation to run */
  fn: () => Promise<T>;
  /** Optional fallback value returned on failure instead of re-throwing */
  fallback?: T;
  /** Optional circuit-breaker instance ({ canCall, onSuccess, onFailure }) */
  circuitBreaker?: { canCall(): boolean; onSuccess(): void; onFailure(): void };
}

/**
 * Execute `fn` with unified telemetry, structured logging, and optional
 * circuit-breaker enforcement.
 *
 * Usage:
 *   const result = await safeExecute({
 *     label: 'InvokeLLM',
 *     fn: () => invokeLLM(params),
 *     circuitBreaker,
 *   });
 */
export async function safeExecute<T>(opts: SafeExecuteOpts<T>): Promise<T> {
  const { label, fn, fallback, circuitBreaker } = opts;

  if (circuitBreaker && !circuitBreaker.canCall()) {
    const err = new Error(`Circuit breaker open — ${label} unavailable`);
    telemetry.emit('client:error', { label, error: err.message, source: 'circuit-breaker' });
    if (fallback !== undefined) return fallback;
    throw err;
  }

  const start = Date.now();
  telemetry.emit('client:request-start', { tool: label });

  try {
    const result = await clientLogger.timed(label, fn);
    circuitBreaker?.onSuccess();
    telemetry.emit('client:request-end', { tool: label, durationMs: Date.now() - start });
    return result;
  } catch (err: any) {
    circuitBreaker?.onFailure();
    telemetry.emit('client:error', { label, error: err?.message ?? String(err), durationMs: Date.now() - start });
    clientLogger.error(label, err);
    if (fallback !== undefined) return fallback;
    throw err;
  }
}