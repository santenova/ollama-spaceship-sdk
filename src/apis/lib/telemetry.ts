/**
 * Performance Telemetry Event Emitter (Improvement #10)
 * Allows React components to subscribe to client lifecycle events.
 * Event names are sourced from telemetry-events.ts — do not add raw strings here.
 */

export type { TelemetryEvent } from './telemetry-events';
import type { TelemetryEvent } from './telemetry-events';

type TelemetryHandler = (payload: Record<string, any>) => void;

const listeners = new Map<TelemetryEvent, Set<TelemetryHandler>>();

/** Extract a short "file:line:col" string from the call site two frames above emit(). */
function getSourceLocation(): string {
  const stack = new Error().stack ?? '';
  // Frame 0 = Error, 1 = getSourceLocation, 2 = emit, 3 = actual caller
  const frame = stack.split('\n')[3] ?? '';
  const match = frame.match(/\((.+?)\)$/) ?? frame.match(/at (.+)$/);
  if (!match) return '';
  // Trim leading CWD/origin so paths stay short
  const raw = match[1].replace(/^.*?\/src\//, 'src/').replace(/\?.*$/, '');
  return raw;
}

export const telemetry = {
  on(event: TelemetryEvent, handler: TelemetryHandler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => listeners.get(event)?.delete(handler); // returns unsubscribe fn
  },

  emit(event: TelemetryEvent, payload: Record<string, any> = {}) {
    const source = getSourceLocation();
    listeners.get(event)?.forEach(h => {
      try { h({ event, timestamp: Date.now(), source, ...payload }); } catch {}
    });
  },
};