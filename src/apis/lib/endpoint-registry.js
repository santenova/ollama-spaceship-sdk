/**
 * EndpointRegistry — singleton that resolves and caches Ollama / ES endpoints (#2)
 * Eliminates duplicated localStorage reads across client.ts, app-params.ts, etc.
 */
import { localStorage, LS_PREFIX } from './app-params';
const _isBrowser = typeof globalThis !== 'undefined' && typeof globalThis.window !== 'undefined';
const _isLocal = () => {
    const host = _isBrowser
        ? globalThis.window.location.hostname
        : (process.env.HOSTNAME || '127.0.0.1');
    return host === 'localhost' || host === '127.0.0.1' || host === 'localhost' || host.startsWith('192.168.');
};
let _cache = null;
function resolve() {
    if (_cache)
        return _cache;
    // Ollama
    let ollamaEndpoints = [];
    try {
        const raw = localStorage.getItem('ollama_endpoints');
        if (raw)
            ollamaEndpoints = JSON.parse(raw).filter(Boolean);
    }
    catch { }
    if (!ollamaEndpoints.length) {
        ollamaEndpoints = _isLocal()
            ? (_isBrowser ? ['/proxy'] : ['http://127.0.0.1:11434'])
            : ['https://christy-ramentaceous-verbatim.ngrok-free.dev'];
    }
    // Elasticsearch
    let elasticsearch = '';
    try {
        elasticsearch = localStorage.getItem(`${LS_PREFIX}server_url`) || '';
    }
    catch { }
    if (!elasticsearch) {
        elasticsearch = _isLocal()
            ? (_isBrowser ? '/db' : 'http://127.0.0.1:9200')
            : 'https://eu-vector-cloud.ngrok.dev';
    }
    _cache = { ollama: ollamaEndpoints, elasticsearch };
    return _cache;
}
export const endpointRegistry = {
    /** Primary Ollama endpoint (string) */
    ollama() {
        return resolve().ollama[0];
    },
    /** All Ollama endpoints (array) */
    ollamaAll() {
        return resolve().ollama;
    },
    /** Elasticsearch / vector-cloud endpoint */
    elasticsearch() {
        return resolve().elasticsearch;
    },
    /**
     * Update endpoints at runtime (e.g. after user saves Config page).
     * Persists to localStorage and invalidates the in-memory cache.
     */
    update(partial) {
        _cache = null; // force re-resolve on next read
        if (partial.ollama?.length) {
            try {
                localStorage.setItem('ollama_endpoints', JSON.stringify(partial.ollama));
            }
            catch { }
        }
        if (partial.elasticsearch) {
            try {
                localStorage.setItem(`${LS_PREFIX}server_url`, partial.elasticsearch);
            }
            catch { }
        }
    },
    /** Invalidate cache (e.g. for tests) */
    invalidate() {
        _cache = null;
    },
};
