/**
 * Unified Authentication Middleware (Improvement #2)
 * Centralizes token injection and refresh for all client requests.
 */
interface AuthMiddlewareOptions {
    getToken: () => string | null;
    onRefreshNeeded?: () => Promise<string | null>;
}
export declare function createAuthMiddleware(opts: AuthMiddlewareOptions): {
    injectAuthHeaders: (existing?: Record<string, string>) => Record<string, string>;
    withAuth: (url: string, init?: RequestInit) => Promise<Response>;
};
export {};
