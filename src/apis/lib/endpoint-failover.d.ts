/**
 * Multi-Endpoint Failover
 *
 * Wraps any async function with automatic failover across Ollama endpoints.
 * On failure, tries the next endpoint in the list before giving up.
 * Health state is cached in memory so cold endpoints are skipped quickly.
 *
 * Usage:
 *   const result = await withFailover(
 *     ollamaEndpoints,
 *     endpoint => chatCompletion([endpoint], model, messages),
 *   );
 */
/**
 * Execute `fn` with the first available endpoint.
 * On failure, marks that endpoint unhealthy and retries with the next.
 * Throws if all endpoints fail.
 */
export declare function withFailover<T>(ollamaEndpoints: string[], fn: (endpoint: string) => Promise<T>): Promise<T>;
/**
 * Ping all endpoints and return a health report.
 * Useful for a live status dashboard.
 */
export declare function pingEndpoints(ollamaEndpoints: string[]): Promise<Array<{
    endpoint: string;
    healthy: boolean;
    latencyMs: number;
}>>;
/** Return the cached health status of all known endpoints. */
export declare function getEndpointHealth(): Array<{
    endpoint: string;
    healthy: boolean;
    failCount: number;
    lastCheckedAt: number;
}>;
/** Reset all cached health state (e.g. after config change). */
export declare function resetEndpointHealth(): void;
