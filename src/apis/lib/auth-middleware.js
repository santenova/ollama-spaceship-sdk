/**
 * Unified Authentication Middleware (Improvement #2)
 * Centralizes token injection and refresh for all client requests.
 */
export function createAuthMiddleware(opts) {
    const { getToken, onRefreshNeeded } = opts;
    /** Returns headers with current auth token injected */
    function injectAuthHeaders(existing = {}) {
        const token = getToken();
        if (!token)
            return existing;
        return { ...existing, Authorization: `Bearer ${token}` };
    }
    /** Wraps a fetch call with automatic token injection and 401 retry */
    async function withAuth(url, init = {}) {
        const headers = injectAuthHeaders(init.headers);
        const res = await fetch(url, { ...init, headers });
        if (res.status === 401 && onRefreshNeeded) {
            const newToken = await onRefreshNeeded();
            if (newToken) {
                const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
                return fetch(url, { ...init, headers: retryHeaders });
            }
        }
        return res;
    }
    return { injectAuthHeaders, withAuth };
}
