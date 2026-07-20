/**
 * Global Request Cancellation / AbortController Manager (Improvement #7)
 * Manages all active requests so they can be cancelled globally or by key.
 */
const controllers = new Map();
export const abortManager = {
    /** Create and register a new AbortController for a given key */
    create(key = 'global') {
        // Cancel any existing controller for this key first
        abortManager.cancel(key);
        const controller = new AbortController();
        controllers.set(key, controller);
        return controller;
    },
    /** Get the signal for a registered key */
    signal(key = 'global') {
        return controllers.get(key)?.signal;
    },
    /** Cancel a specific request by key */
    cancel(key = 'global') {
        const existing = controllers.get(key);
        if (existing && !existing.signal.aborted) {
            existing.abort();
        }
        controllers.delete(key);
    },
    /** Cancel ALL active requests */
    cancelAll() {
        controllers.forEach((ctrl, key) => {
            if (!ctrl.signal.aborted)
                ctrl.abort();
            controllers.delete(key);
        });
    },
    /** Check if a key has an active (non-aborted) controller */
    isActive(key) {
        const ctrl = controllers.get(key);
        return !!ctrl && !ctrl.signal.aborted;
    },
};
