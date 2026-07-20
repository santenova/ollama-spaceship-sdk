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
import { telemetry } from './telemetry';
import { TelemetryEvents } from './telemetry-events';
const healthCache = new Map();
const UNHEALTHY_TTL_MS = 30000; // retry unhealthy endpoints after 30s
function getHealth(endpoint) {
    return healthCache.get(endpoint) ?? { healthy: true, lastCheckedAt: 0, failCount: 0 };
}
function markHealthy(endpoint) {
    healthCache.set(endpoint, { healthy: true, lastCheckedAt: Date.now(), failCount: 0 });
}
function markUnhealthy(endpoint) {
    const h = getHealth(endpoint);
    healthCache.set(endpoint, { healthy: false, lastCheckedAt: Date.now(), failCount: h.failCount + 1 });
}
function isAvailable(endpoint) {
    const h = getHealth(endpoint);
    if (h.healthy)
        return true;
    // Retry after TTL
    return Date.now() - h.lastCheckedAt > UNHEALTHY_TTL_MS;
}
/**
 * Execute `fn` with the first available endpoint.
 * On failure, marks that endpoint unhealthy and retries with the next.
 * Throws if all endpoints fail.
 */
export async function withFailover(ollamaEndpoints, fn) {
    const candidates = ollamaEndpoints.filter(e => !!e);
    const ordered = [
        ...candidates.filter(isAvailable),
        ...candidates.filter(e => !isAvailable(e)), // include unhealthy as last resort
    ];
    let lastError = null;
    for (const endpoint of ordered) {
        try {
            const result = await fn(endpoint);
            markHealthy(endpoint);
            return result;
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            markUnhealthy(endpoint);
            telemetry.emit(TelemetryEvents.FALLBACK_TRIGGERED, { endpoint, error: lastError.message });
        }
    }
    throw lastError ?? new Error('All Ollama endpoints failed');
}
/**
 * Ping all endpoints and return a health report.
 * Useful for a live status dashboard.
 */
export async function pingEndpoints(ollamaEndpoints) {
    return Promise.all(ollamaEndpoints.filter(e => !!e).map(async (ep) => {
        const endpoint = ep.replace(/\/$/, '');
        const start = Date.now();
        try {
            const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
            const latencyMs = Date.now() - start;
            const healthy = res.ok;
            if (healthy)
                markHealthy(endpoint);
            else
                markUnhealthy(endpoint);
            return { endpoint, healthy, latencyMs };
        }
        catch {
            markUnhealthy(endpoint);
            return { endpoint, healthy: false, latencyMs: Date.now() - start };
        }
    }));
}
/** Return the cached health status of all known endpoints. */
export function getEndpointHealth() {
    return Array.from(healthCache.entries()).map(([endpoint, h]) => ({ endpoint, ...h }));
}
/** Reset all cached health state (e.g. after config change). */
export function resetEndpointHealth() {
    healthCache.clear();
}
