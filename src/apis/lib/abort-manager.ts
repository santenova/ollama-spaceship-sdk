/**
 * Global Request Cancellation / AbortController Manager (Improvement #7)
 * Manages all active requests so they can be cancelled globally or by key.
 */

const controllers = new Map<string, AbortController>();

export const abortManager = {
  /** Create and register a new AbortController for a given key */
  create(key: string = 'global'): AbortController {
    // Cancel any existing controller for this key first
    abortManager.cancel(key);
    const controller = new AbortController();
    controllers.set(key, controller);
    return controller;
  },

  /** Get the signal for a registered key */
  signal(key: string = 'global'): AbortSignal | undefined {
    return controllers.get(key)?.signal;
  },

  /** Cancel a specific request by key */
  cancel(key: string = 'global') {
    const existing = controllers.get(key);
    if (existing && !existing.signal.aborted) {
      existing.abort();
    }
    controllers.delete(key);
  },

  /** Cancel ALL active requests */
  cancelAll() {
    controllers.forEach((ctrl, key) => {
      if (!ctrl.signal.aborted) ctrl.abort();
      controllers.delete(key);
    });
  },

  /** Check if a key has an active (non-aborted) controller */
  isActive(key: string): boolean {
    const ctrl = controllers.get(key);
    return !!ctrl && !ctrl.signal.aborted;
  },
};