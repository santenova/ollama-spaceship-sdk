/**
 * Client-Side Request Batcher (Improvement #5)
 * Aggregates multiple rapid calls into a single batched execution.
 */
export declare function createBatcher<T>(executor: (batch: any[][]) => Promise<T[]>, delayMs?: number): (...args: any[]) => Promise<T>;
