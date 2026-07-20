/**
 * Performance Telemetry Event Emitter (Improvement #10)
 * Allows React components to subscribe to client lifecycle events.
 * Event names are sourced from telemetry-events.ts — do not add raw strings here.
 */
export type { TelemetryEvent } from './telemetry-events';
import type { TelemetryEvent } from './telemetry-events';
type TelemetryHandler = (payload: Record<string, any>) => void;
export declare const telemetry: {
    on(event: TelemetryEvent, handler: TelemetryHandler): () => boolean;
    emit(event: TelemetryEvent, payload?: Record<string, any>): void;
};
