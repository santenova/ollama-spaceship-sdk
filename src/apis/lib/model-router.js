/**
 * Capability-aware Model Router (Improvement #8)
 * Uses Ollama's /api/show capabilities to select the best available model
 * for a given task, ranked by parameter count (larger = better).
 * Falls back to static hints if Ollama is unreachable.
 *
 * Cache hierarchy (avoids re-running the 50-request /api/show discovery):
 *   1. In-memory map         — instant, per-session
 *   2. localStorage           — instant, per-browser
 *   3. Elasticsearch index    — one network call, shared across ALL clients
 *   4. Live Ollama discovery  — 1 + N requests (50 models), runs at most
 *                              once per day per endpoint, then writes to
 *                              all three layers above.
 */
import { getEsConfig } from './es-entities';
/**
 * Ordered preference list of Ollama capability strings per task type.
 *
 * Instead of a rigid 1:1 mapping, each task declares capabilities in priority
 * order — the resolver picks the first capability that actually has models
 * available in the live capability map (discovered from /api/show, like the
 * bash script: `curl /v1/models | jq .data[].id` → `curl /api/show`).
 *
 * This lets a task gracefully fall back (e.g. `json` prefers a tools-capable
 * model but will use a plain completion model if none has `tools`), and makes
 * the mapping resilient to capability strings Ollama may add or rename.
 */
const TASK_CAPABILITIES = {
    tool_call: ['tools'],
    websearch: ['tools'],
    vision: ['vision'],
    thinking: ['thinking'],
    json: ['tools', 'completion'], // prefer tools-capable, fall back to completion
    chat: ['completion'],
    embedding: ['embeddings'],
};
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — discovery runs at most once/day
const LS_KEY = 'model_router_capability_cache';
const ES_INDEX = 'model-router-cache';
/** Cooldown between discovery attempts (even on failure) — prevents hammering. */
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
// In-memory cache (warmed from localStorage on first access)
let _capabilityCache = null;
let _cacheEndpoint = '';
let _refreshPromise = null;
let _lastRefreshAttempt = 0;
/** Normalize endpoint for comparison — treat localhost and 127.0.0.1 as equivalent. */
function normalizeEp(ep) {
    return ep.replace(/\blocalhost\b/g, '127.0.0.1');
}
function loadFromStorage() {
    try {
        const raw = typeof globalThis.localStorage !== 'undefined'
            ? globalThis.localStorage.getItem(LS_KEY)
            : null;
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function saveToStorageDirect(endpoint, map) {
    try {
        if (typeof globalThis.localStorage !== 'undefined') {
            globalThis.localStorage.setItem(LS_KEY, JSON.stringify({ endpoint, map, ts: Date.now() }));
        }
    }
    catch { }
}
function saveToStorage(endpoint, map) {
    saveToStorageDirect(endpoint, map);
}
/** Sanitise an endpoint URL into a valid ES document ID. */
function docIdFor(endpoint) {
    return endpoint.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}
/**
 * Read the shared capability cache from the dedicated Elasticsearch index.
 * One GET — returns the cached map or null if absent/failed.
 */
async function loadFromEs(endpoint) {
    try {
        const es = getEsConfig();
        const res = await fetch(`${es.endpoint}/${ES_INDEX}/_doc/${docIdFor(endpoint)}`);
        if (!res.ok)
            return null;
        const data = await res.json();
        if (!data.found || !data._source?.map)
            return null;
        return {
            endpoint,
            map: data._source.map,
            ts: data._source.ts,
        };
    }
    catch {
        return null;
    }
}
/**
 * Write the capability map to the shared Elasticsearch index so all clients
 * can read it without each running the 50-request discovery.
 */
async function saveToEs(endpoint, map) {
    try {
        const es = getEsConfig();
        // Ensure the index exists (cheap HEAD, only creates once)
        await fetch(`${es.endpoint}/${ES_INDEX}`, { method: 'HEAD' })
            .then((r) => r.status === 404
            ? fetch(`${es.endpoint}/${ES_INDEX}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings: { properties: {
                            endpoint: { type: 'keyword' },
                            map: { type: 'object', enabled: false },
                            ts: { type: 'date' },
                        } } }),
            })
            : null);
        await fetch(`${es.endpoint}/${ES_INDEX}/_doc/${docIdFor(endpoint)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint, map, ts: Date.now() }),
        });
    }
    catch { }
}
import { endpointRegistry } from './endpoint-registry';
const getEndpoint = () => endpointRegistry.ollama();
async function fetchModelIds(endpoint) {
    const res = await fetch(`${endpoint}/v1/models`);
    if (!res.ok)
        throw new Error(`/v1/models ${res.status}`);
    const data = await res.json();
    return data.data.map((m) => m.id);
}
async function fetchModelCapabilities(endpoint, modelId) {
    const res = await fetch(`${endpoint}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
    });
    if (!res.ok)
        throw new Error(`/api/show ${res.status}`);
    const data = await res.json();
    return {
        capabilities: data.capabilities ?? [],
        paramCount: data.model_info?.['general.parameter_count'] ?? 0,
    };
}
/** Rebuild the capability→{model:params} map from live Ollama data */
async function buildCapabilityMap(endpoint) {
    const map = {};
    const modelIds = await fetchModelIds(endpoint);
    await Promise.all(modelIds.map(async (id) => {
        try {
            const { capabilities, paramCount } = await fetchModelCapabilities(endpoint, id);
            for (const cap of capabilities) {
                if (!map[cap])
                    map[cap] = {};
                map[cap][id] = paramCount;
            }
        }
        catch {
            // skip unavailable models silently
        }
    }));
    return map;
}
/** Refresh the cache in the background (deduplicated, cooldown-protected) */
function scheduleRefresh(ep) {
    if (_refreshPromise)
        return;
    // Cooldown: don't attempt discovery more than once per REFRESH_COOLDOWN_MS.
    // This prevents every resolve() call from re-triggering the 50-request burst
    // when the cache is stale, missing, or the last refresh failed.
    if (Date.now() - _lastRefreshAttempt < REFRESH_COOLDOWN_MS)
        return;
    _lastRefreshAttempt = Date.now();
    _refreshPromise = buildCapabilityMap(ep)
        .then((map) => {
        _capabilityCache = map;
        _cacheEndpoint = ep;
        saveToStorage(ep, map);
        saveToEs(ep, map); // share across all clients via ES
    })
        .catch(() => { })
        .finally(() => { _refreshPromise = null; });
}
/**
 * Returns the capability map immediately from memory or localStorage.
 * If localStorage misses, kicks off an async ES lookup (shared cache).
 * Never blocks a prompt — falls back to empty map until cache arrives.
 */
function getCapabilityMap() {
    const ep = getEndpoint();
    const epN = normalizeEp(ep);
    // Memory hit (same endpoint, normalized comparison)
    if (_capabilityCache && normalizeEp(_cacheEndpoint) === epN)
        return _capabilityCache;
    // Try localStorage — accept any entry whose normalized endpoint matches
    const stored = loadFromStorage();
    if (stored && stored.map) {
        const storedN = normalizeEp(stored.endpoint);
        if (storedN === epN) {
            const fresh = (Date.now() - stored.ts) < CACHE_TTL_MS;
            _capabilityCache = stored.map;
            _cacheEndpoint = ep;
            if (!fresh)
                scheduleRefresh(ep);
            return _capabilityCache;
        }
        // Endpoint mismatch but we still have a stored map — use it as a best-effort
        // fallback so Speed resolution works in tests / single-Ollama setups.
        // We don't populate _capabilityCache here so a proper match can overwrite it.
        if (Object.keys(stored.map).length > 0) {
            // Kick off ES lookup / refresh without blocking
            scheduleRefresh(ep);
            return stored.map;
        }
    }
    // localStorage miss — check ES shared cache asynchronously (non-blocking)
    loadFromEs(ep).then((esCache) => {
        if (esCache) {
            _capabilityCache = esCache.map;
            _cacheEndpoint = ep;
            saveToStorage(ep, esCache.map);
            if (Date.now() - esCache.ts >= CACHE_TTL_MS) {
                scheduleRefresh(ep);
            }
        }
        else {
            scheduleRefresh(ep);
        }
    }).catch(() => { });
    return {};
}
/**
 * Resolve the first capability in a task's preference list that has at least
 * one model in the live capability map. Returns the capability string, or
 * `'completion'` as a last-resort fallback.
 */
function resolveCapability(map, taskType) {
    const caps = TASK_CAPABILITIES[taskType] ?? ['completion'];
    for (const cap of caps) {
        if (map[cap] && Object.keys(map[cap]).length > 0)
            return cap;
    }
    return caps[0] ?? 'completion';
}
/** Pick the best model for a capability, ordered by priority */
function bestModelForCapability(map, capability, priority = 'quality') {
    const bucket = map[capability];
    if (!bucket)
        return null;
    const entries = Object.entries(bucket);
    if (!entries.length)
        return null;
    // quality → largest params first (most capable); speed → smallest params first (fastest)
    entries.sort((a, b) => priority === 'speed' ? a[1] - b[1] : b[1] - a[1]);
    return entries[0][0];
}
/**
 * Pick a model for a capability using a Speed score (0–100), expressed as a
 * percentage of the average paramCount across models with that capability.
 *
 *   Speed=100  → target = min paramCount  (fastest model)
 *   Speed=50   → target = avg paramCount  (median model)
 *   Speed=0    → target = max paramCount  (most capable model)
 *
 * The target paramCount is interpolated through (0→max, 50→avg, 100→min) and
 * the model whose paramCount is closest to the target is returned.
 * Uses paramCount from /api/show (fetchModelCapabilities).
 */
function bestModelForSpeed(map, capability, speed) {
    const bucket = map[capability];
    if (!bucket)
        return null;
    const entries = Object.entries(bucket);
    if (!entries.length)
        return null;
    const params = entries.map(([, p]) => p);
    const min = Math.min(...params);
    const max = Math.max(...params);
    const avg = params.reduce((s, p) => s + p, 0) / params.length;
    const s = Math.max(0, Math.min(100, speed));
    // Interpolate target paramCount: 0→max, 50→avg, 100→min
    let target;
    if (s >= 50) {
        // upper half: avg → min
        const t = (s - 50) / 50; // 0 at 50, 1 at 100
        target = avg - t * (avg - min);
    }
    else {
        // lower half: max → avg
        const t = s / 50; // 0 at 0, 1 at 50
        target = max - t * (max - avg);
    }
    // Find the model whose paramCount is closest to the target
    let best = entries[0];
    let bestDist = Math.abs(entries[0][1] - target);
    for (let i = 1; i < entries.length; i++) {
        const dist = Math.abs(entries[i][1] - target);
        if (dist < bestDist) {
            best = entries[i];
            bestDist = dist;
        }
    }
    return best[0];
}
/**
 * Pick the best model for a capability, filtered to models that also support
 * every capability in `requiredCaps`. Speed (0–100) selects by paramCount
 * within the filtered set.
 */
function bestModelForCapabilities(map, capability, requiredCaps, speed) {
    const bucket = map[capability];
    if (!bucket || !requiredCaps.length)
        return null;
    // Filter to models present under EVERY required capability
    let candidates = [];
    if (map[requiredCaps[0]]) {
        candidates = Object.entries(map[requiredCaps[0]]);
    }
    if (!candidates.length)
        return null;
    for (let i = 1; i < requiredCaps.length; i++) {
        const cb = map[requiredCaps[i]];
        if (!cb)
            return null;
        candidates = candidates.filter(([mId]) => mId in cb);
    }
    // Further filter to models also in the primary capability bucket
    candidates = candidates.filter(([mId]) => mId in bucket);
    if (!candidates.length)
        return null;
    // Interpolated paramCount target (speed-axis), same logic as bestModelForSpeed
    const params = candidates.map(([, p]) => p);
    const min = Math.min(...params);
    const max = Math.max(...params);
    const avg = params.reduce((s, p) => s + p, 0) / params.length;
    const s = Math.max(0, Math.min(100, speed));
    let target;
    if (s >= 50) {
        const t = (s - 50) / 50;
        target = avg - t * (avg - min);
    }
    else {
        const t = s / 50;
        target = max - t * (max - avg);
    }
    let best = candidates[0];
    let bestDist = Math.abs(candidates[0][1] - target);
    for (let i = 1; i < candidates.length; i++) {
        const dist = Math.abs(candidates[i][1] - target);
        if (dist < bestDist) {
            best = candidates[i];
            bestDist = dist;
        }
    }
    return best[0];
}
export const modelRouter = {
    /** Read-only access to the in-memory capability cache (for diagnostics/tests) */
    get capabilityCache() {
        return _capabilityCache;
    },
    /** Invalidate the capability cache (e.g. after endpoint change) */
    invalidateCache() {
        _capabilityCache = null;
        _cacheEndpoint = '';
        _lastRefreshAttempt = 0; // allow immediate refresh after manual invalidation
        endpointRegistry.invalidate(); // force re-read of ollama_endpoints from localStorage
    },
    /**
     * Synchronous resolve — always instant (reads memory/localStorage).
     * A background refresh runs automatically when cache is stale.
     * Falls back to defaultModel if cache is empty (first ever cold start).
     *
     * Supports two call forms:
     *   resolve('chat', prompt, defaultModel, 'quality')        // positional (legacy)
     *   resolve({ TaskType: 'chat', Speed: 100 })               // options object
     *
     * Speed (0–100) ranks models by paramCount: 100 = fastest (smallest),
     * 0 = most capable (largest). Ignored if `priority` is set explicitly.
     */
    resolve(taskTypeOrOpts, _prompt = '', defaultModel = '', priority = 'quality') {
        const map = getCapabilityMap();
        let cap;
        let fallback;
        if (typeof taskTypeOrOpts === 'string') {
            cap = resolveCapability(map, taskTypeOrOpts);
            fallback = defaultModel;
            return bestModelForCapability(map, cap, priority) ?? fallback;
        }
        // Options object form
        const opts = taskTypeOrOpts;
        cap = resolveCapability(map, opts.TaskType);
        fallback = opts.defaultModel ?? '';
        if (opts.requiredCaps?.length) {
            const speed = opts.Speed ?? 100;
            // When requiredCaps are specified, only return a model that satisfies ALL
            // of them. If none qualifies, fall back to defaultModel rather than
            // returning a model that lacks the required capabilities.
            return bestModelForCapabilities(map, cap, opts.requiredCaps, speed)
                ?? fallback;
        }
        if (opts.priority) {
            return bestModelForCapability(map, cap, opts.priority) ?? fallback;
        }
        if (opts.Speed !== undefined) {
            return bestModelForSpeed(map, cap, opts.Speed) ?? fallback;
        }
        return bestModelForCapability(map, cap, 'quality') ?? fallback;
    },
    /**
     * Register a custom task type (or override an existing one) with an ordered
     * list of capability preferences. Lets callers extend routing at runtime
     * without editing this file.
     *
     * Usage:
     *   modelRouter.registerTaskType('translation', ['tools', 'completion']);
     *   modelRouter.resolve({ TaskType: 'translation', Speed: 50, defaultModel: 'fb' });
     */
    registerTaskType(taskType, capabilities) {
        if (!Array.isArray(capabilities) || capabilities.length === 0) {
            throw new Error('registerTaskType: capabilities must be a non-empty array');
        }
        TASK_CAPABILITIES[taskType] = capabilities;
    },
    /** Read-only access to the full task→capabilities preference map. */
    get taskCapabilities() {
        return { ...TASK_CAPABILITIES };
    },
    /**
     * Return ALL available models for a given task type, sorted fastest-first
     * (ascending paramCount). Useful for beaming (fan-out to all models).
     * Falls back to [defaultModel] when the cache is empty.
     */
    resolveAll(taskType, defaultModel) {
        const map = getCapabilityMap();
        const cap = resolveCapability(map, taskType);
        const bucket = map[cap];
        if (!bucket || !Object.keys(bucket).length)
            return [defaultModel].filter(Boolean);
        return Object.entries(bucket)
            .sort((a, b) => a[1] - b[1]) // ascending param count → fastest first
            .map(([id]) => id);
    },
    /** Kept for backward compat — now just wraps the sync resolve (always Speed=100) */
    async resolveAsync(taskType, defaultModel, _priority = 'quality') {
        return this.resolve({ TaskType: taskType, Speed: 100, defaultModel });
    },
};
