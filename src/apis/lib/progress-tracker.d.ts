/**
 * Progress tracker for streamed responses.
 *
 * Wraps raw tokens from a stream and emits augmented chunks with
 * cumulative metadata (token count, elapsed time).
 *
 * Usage:
 *   const tracker = createProgressTracker();
 *   const stream = client.streamResponse('chat', 'hello');
 *   stream.subscribe({
 *     next(chunk) {
 *       const { text, tokenIndex, elapsedMs, totalTokens } = tracker.next(chunk);
 *       // render or log augmented chunk
 *     },
 *     complete() {
 *       const summary = tracker.summary();
 *       // { totalTokens, totalElapsedMs, tokensPerSecond }
 *     },
 *   });
 */
import { type GeoLocation } from './location';
export interface AugmentedChunk {
    /** The raw text token. */
    text: string;
    /** 0-based index of this token in the stream. */
    tokenIndex: number;
    /** Cumulative elapsed milliseconds since the first token. */
    elapsedMs: number;
    /** Total tokens received so far (same as tokenIndex + 1). */
    totalTokens: number;
    /** User's latitude at stream start (if available). */
    lat?: number;
    /** User's longitude at stream start (if available). */
    lng?: number;
}
export interface StreamSummary {
    /** Total tokens received. */
    totalTokens: number;
    /** Total elapsed ms from first token to last. */
    totalElapsedMs: number;
    /** Tokens per second (totalTokens / totalElapsedMs * 1000). */
    tokensPerSecond: number;
    /** Timing breakdown by phase. */
    timing: {
        /** Ms until the first token arrived (time-to-first-token). */
        ttftMs: number;
        /** Timestamp when streaming started (epoch ms). */
        startedAt: number;
        /** Timestamp when streaming completed (epoch ms). */
        completedAt: number;
    };
}
export interface ProgressTracker {
    /** Feed the next raw token; returns augmented metadata. */
    next(text: string): AugmentedChunk;
    /** Signal that streaming is complete; returns final summary. */
    summary(): StreamSummary;
    /** Reset all counters (e.g. for a new stream on the same tracker). */
    reset(): void;
    /** Current token count (read-only). */
    readonly count: number;
    /** Elapsed ms since the first token arrived. */
    readonly elapsed: number;
}
export declare function createProgressTracker(location?: GeoLocation): ProgressTracker;
