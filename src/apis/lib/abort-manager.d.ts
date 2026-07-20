/**
 * Global Request Cancellation / AbortController Manager (Improvement #7)
 * Manages all active requests so they can be cancelled globally or by key.
 */
export declare const abortManager: {
    /** Create and register a new AbortController for a given key */
    create(key?: string): AbortController;
    /** Get the signal for a registered key */
    signal(key?: string): AbortSignal | undefined;
    /** Cancel a specific request by key */
    cancel(key?: string): void;
    /** Cancel ALL active requests */
    cancelAll(): void;
    /** Check if a key has an active (non-aborted) controller */
    isActive(key: string): boolean;
};
