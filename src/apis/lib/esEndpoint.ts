/**
 * Elasticsearch endpoint helper — delegates to endpointRegistry (single source of truth).
 * Kept for backwards compatibility with existing imports.
 */
import { endpointRegistry } from './endpoint-registry';

export const LOCAL_ES_ENDPOINT = '/db';
export const REMOTE_ES_ENDPOINT = 'https://eu-vector-cloud.ngrok.dev';

export const getEsEndpoint = (): string => endpointRegistry.elasticsearch();

interface EsEndpointCheck {
  ok: boolean;
  status: number;
  latencyMs: number;
  cluster?: string;
  error?: string;
}

/**
 * Quick reachability check — pings /_cluster/health on the given endpoint.
 */
export const checkEsEndpoint = async (endpoint: string, timeoutMs = 5000): Promise<EsEndpointCheck> => {
  const start = performance.now();
  try {
    const res = await fetch(`${endpoint}/_cluster/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) return { ok: false, status: res.status, latencyMs };
    const data = await res.json();
    return { ok: true, status: data.status, latencyMs, cluster: data.cluster_name };
  } catch (e: any) {
    return { ok: false, status: 0, latencyMs: Math.round(performance.now() - start), error: e?.message };
  }
};