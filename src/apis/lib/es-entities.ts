/**
 * Standalone Elasticsearch entity manager.
 *
 * Creates a Proxy-based `entities` object
 * entity interface (list, filter, get, create, update, delete, deleteMany,
 * bulkCreate, bulkUpdate, updateMany, subscribe) — all backed directly by
 * Elasticsearch.
 *
 * No React, no axios, no circular client dependency — pure fetch + ES.
 */

import { localStorage } from './app-params';
import { endpointRegistry } from './endpoint-registry';
import { translateQuery, parseSort, sourceFilter } from './es-query-builder';

const ES_CONFIG_KEY = 'elasticsearch_config';
const ES_CONFIG_VERSION = 10; // bumped: global index prefix is now configurable via getIndexPrefix/setIndexPrefix

const INDEX_PREFIX_KEY = 'es_index_prefix';
const DEFAULT_INDEX_PREFIX = 'prompt-hub';

// ---------------------------------------------------------------------------
// Entity → index mapping
// ---------------------------------------------------------------------------

// Entity → index suffix (the part after the global prefix, e.g. "prompt-hub-persona" → "persona")
const ENTITY_INDEX_SUFFIXES = {
  Persona: 'persona',
  Template: 'template',
  ChatSession: 'session',
  Scenario: 'scenario',
  DevilsAdvocateResult: 'devils',
  AnalogyBuilderResult: 'analogy',
  PersonaDebateResult: 'debate',
  ContentRepurposerResult: 'repurpose',
  StructureArchitectResult: 'outline',
  GeneratorList: 'generator-list',
  TestCase: 'test-case',
  TestResult: 'test-result',
  PersonaVector: 'persona-vector',
};

const slugFor = (name) => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Returns the live entity→suffix map, including any indices dynamically
 * registered by discoverPrefixedIndices / setIndexPrefix at runtime.
 * Use this instead of a hard-coded copy so the UI reflects discovered indices.
 */
export function getEntityIndexSuffixes(): Record<string, string> {
  return { ...(ENTITY_INDEX_SUFFIXES as any) };
}

/**
 * Global index prefix used to build every entity's default ES index name.
 * Stored in its own localStorage key so it survives shared ES config version bumps.
 * Default: "prompt-hub" → indices like prompt-hub-persona, prompt-hub-template, …
 */
export function getIndexPrefix() {
  try {
    const v = localStorage.getItem(INDEX_PREFIX_KEY);
    if (v && typeof v === 'string' && v.trim()) return v.trim();
  } catch {}
  return DEFAULT_INDEX_PREFIX;
}

/**
 * Change the global index prefix (e.g. "prompt-hub" → "sample-data") and rebuild
 * the shared ES config indices map so esEntities immediately resolve to the new
 * indices. Custom per-entity overrides are regenerated to the new prefix.
 *
 * Optionally accepts `discoveredIndices` — raw index names returned by _cat/indices
 * (e.g. ["sample-data-persona", "sample-data-template", "sample-data-custom-thing"]).
 * Any index matching the prefix that isn't already in ENTITY_INDEX_SUFFIXES will be
 * registered as a new entity so the esEntities proxy covers it immediately.
 */
/**
 * Register any discovered-but-unknown indices so the proxy covers them.
 * Suffix is converted to a PascalCase entity name (e.g. "my-things" → "MyThings").
 * Only indices starting with `<prefix>-` are considered.
 */
function registerDiscoveredIndices(prefix: string, discoveredIndices: string[]) {
  const strip = prefix + '-';
  for (const idxName of discoveredIndices) {
    if (!idxName || !idxName.startsWith(strip)) continue;
    const suffix = idxName.slice(strip.length);
    if (!suffix) continue;
    const entityName = suffix
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
    if (!ENTITY_INDEX_SUFFIXES[entityName]) {
      (ENTITY_INDEX_SUFFIXES as any)[entityName] = suffix;
    }
  }
}

/**
 * Scan ES `_cat/indices` for every index whose name starts with the current
 * index prefix, and register any that aren't already known as new entities.
 *
 * CACHED: a fingerprint (sorted prefixed index names) + timestamp is kept in
 * localStorage with a TTL. The scan is skipped entirely if the cache is fresh
 * and the fingerprint hasn't changed — so createEsEntities doesn't hit ES on
 * every call. Only when the index set actually changes do we re-register and
 * rebuild the config.
 */
const DISCOVERY_CACHE_KEY = 'es_discovery_cache';
const DISCOVERY_TTL_MS = 5 * 60 * 1000; // 5 minutes

function loadDiscoveryCache(): { fingerprint?: string; ts?: number } {
  try {
    const raw = localStorage.getItem(DISCOVERY_CACHE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {}
  return {};
}

function saveDiscoveryCache(fingerprint: string) {
  try {
    localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify({ fingerprint, ts: Date.now() }));
  } catch {}
}

function fingerprintOf(names: string[]): string {
  return [...names].sort().join('\n');
}

export async function discoverPrefixedIndices(getConfig) {
  const cfg = (typeof getConfig === 'function' ? getConfig : () => getConfig)();
  const endpoint = cfg?.endpoint || getEsEndpoint();
  const prefix = cfg?.indexPrefix || getIndexPrefix();

  // Fresh cache → skip the network round-trip entirely
  const cached = loadDiscoveryCache();
  const now = Date.now();
  if (cached.fingerprint && cached.ts && now - cached.ts < DISCOVERY_TTL_MS) {
    return; // nothing changed since last scan within TTL
  }

  let rows: any[];
  try {
    const res = await fetch(`${endpoint}/_cat/indices?format=json`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    rows = await res.json();
  } catch {
    return;
  }
  if (!Array.isArray(rows)) return;

  const matched: string[] = [];
  for (const row of rows) {
    const name = row?.index;
    if (typeof name === 'string' && name.startsWith(prefix + '-')) {
      matched.push(name);
    }
  }

  const fingerprint = fingerprintOf(matched);

  // Same set as last time → just refresh the timestamp, no config churn
  if (cached.fingerprint && cached.fingerprint === fingerprint) {
    saveDiscoveryCache(fingerprint);
    return;
  }

  // Index set changed (or first run) → register new suffixes + rebuild config
  if (matched.length > 0) {
    registerDiscoveredIndices(prefix, matched);
    const freshCfg = getEsConfig();
    const indices = {};
    Object.keys(ENTITY_INDEX_SUFFIXES).forEach((name) => {
      indices[name] = `${prefix}-${ENTITY_INDEX_SUFFIXES[name]}`;
    });
    saveEsConfig({ ...freshCfg, indexPrefix: prefix, indices });
  }
  saveDiscoveryCache(fingerprint);
}

/**
 * Force-clear the discovery cache so the next createEsEntities / discovery
 * call re-scans regardless of TTL. Useful after setIndexPrefix or manual
 * index creation.
 */
export function clearDiscoveryCache() {
  try { localStorage.removeItem(DISCOVERY_CACHE_KEY); } catch {}
}

export function setIndexPrefix(prefix, discoveredIndices?: string[]) {
  const p = (prefix || '').trim() || DEFAULT_INDEX_PREFIX;
  try { localStorage.setItem(INDEX_PREFIX_KEY, p); } catch {}

  // Prefix changed → cached fingerprint is stale, force a fresh scan next time
  clearDiscoveryCache();

  if (Array.isArray(discoveredIndices)) {
    registerDiscoveredIndices(p, discoveredIndices);
  }

  try {
    const cfg = getEsConfig();
    const indices = {};
    Object.keys(ENTITY_INDEX_SUFFIXES).forEach((name) => {
      indices[name] = `${p}-${ENTITY_INDEX_SUFFIXES[name]}`;
    });
    saveEsConfig({ ...cfg, indexPrefix: p, indices });
  } catch {}
}

const defaultIndexFor = (entityName, prefix) => {
  const p = prefix || getIndexPrefix();
  return `${p}-${ENTITY_INDEX_SUFFIXES[entityName] || slugFor(entityName)}`;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getEsConfig() {
  const prefix = getIndexPrefix();
  const indices = {};
  Object.keys(ENTITY_INDEX_SUFFIXES).forEach((name) => {
    indices[name] = `${prefix}-${ENTITY_INDEX_SUFFIXES[name]}`;
  });

  const fresh = {
    endpoint: endpointRegistry.elasticsearch(),
    enabled: true,
    indexPrefix: prefix,
    indices,
    _v: ES_CONFIG_VERSION,
  };

  try {
    const stored = localStorage.getItem(ES_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed._v !== ES_CONFIG_VERSION) {
        localStorage.setItem(ES_CONFIG_KEY, JSON.stringify(fresh));
        return fresh;
      }
      return {
        ...fresh,
        // Endpoint is always resolved from the endpoint registry — it adapts to
        // the runtime environment (local → /db proxy, remote → ngrok cloud) and
        // must not be overridden by a stale stored value.
        endpoint: fresh.endpoint,
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : fresh.enabled,
        indexPrefix: parsed.indexPrefix || fresh.indexPrefix,
        indices: { ...fresh.indices, ...parsed.indices },
      };
    }
  } catch {}

  try { localStorage.setItem(ES_CONFIG_KEY, JSON.stringify(fresh)); } catch {}
  return fresh;
}

export function saveEsConfig(cfg) {
  try { localStorage.setItem(ES_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

export function getEsEndpoint() {
  return getEsConfig().endpoint;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (res) => {
  if (!res.ok) throw new Error(`ES error ${res.status}: ${res.statusText}`);
  return res.json();
};

// Shared explicit mapping applied to every index on creation.
// Covers the built-in fields + common entity fields so ES doesn't
// auto-map dates as text or strings without a .keyword sub-field.
const BASE_MAPPING = {
  mappings: {
    properties: {
      id:           { type: 'keyword' },
      created_date: { type: 'date' },
      updated_date: { type: 'date' },
      created_by_id:{ type: 'keyword' },
      status:       { type: 'keyword' },
      category:     { type: 'keyword' },
      type:         { type: 'keyword' },
      is_public:    { type: 'boolean' },
      is_active:    { type: 'boolean' },
      is_custom:    { type: 'boolean' },
      use_count:    { type: 'integer' },
      rating:       { type: 'float' },
      rating_count: { type: 'integer' },
      version:      { type: 'integer' },
    },
  },
};

/**
 * Shared index-creation helper — used internally and exported for feature
 * modules (conversation-memory, scheduled-jobs, ab-testing) so they don't
 * each duplicate the HEAD → 404 → PUT pattern.
 *
 * @param endpoint   ES base URL
 * @param index      Index name
 * @param mappings   Optional custom mappings body; defaults to BASE_MAPPING
 */
export async function ensureEsIndex(
  endpoint: string,
  index: string,
  mappings?: Record<string, any>,
): Promise<void> {
  try {
    const check = await fetch(`${endpoint}/${index}`, { method: 'HEAD' });
    if (check.status === 404) {
      await fetch(`${endpoint}/${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappings ?? BASE_MAPPING),
      });
    }
  } catch {}
}

const ensureIndex = (endpoint: string, index: string) => ensureEsIndex(endpoint, index);

// ---------------------------------------------------------------------------
// Entity handler factory
// ---------------------------------------------------------------------------

function createEsEntityHandler(entityName, getConfig) {
  const resolve = () => {
    const cfg = getConfig();
    const index = cfg.indices?.[entityName] || defaultIndexFor(entityName, cfg.indexPrefix);
    return { endpoint: cfg.endpoint, index };
  };

  return {
    // ---- list(sort, limit, skip, fields) ---------------------------------
    async list(sort, limit, skip, fields) {
      const { endpoint, index } = resolve();
      await ensureIndex(endpoint, index);
      const body: any = {
        query: { match_all: {} },
        sort: parseSort(sort),
        size: limit || 50,
        from: skip || 0,
      };
      if (sourceFilter(fields)) body._source = sourceFilter(fields);
      const data = await json(await fetch(`${endpoint}/${index}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      return (data.hits?.hits || []).map(h => ({ id: h._id, ...h._source }));
    },

    // ---- filter(query, sort, limit, skip, fields) ------------------------
    async filter(query, sort, limit, skip, fields) {
      const { endpoint, index } = resolve();
      await ensureIndex(endpoint, index);
      const body: any = {
        query: translateQuery(query),
        sort: parseSort(sort),
        size: limit || 50,
        from: skip || 0,
      };
      if (sourceFilter(fields)) body._source = sourceFilter(fields);
      const data = await json(await fetch(`${endpoint}/${index}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      return (data.hits?.hits || []).map(h => ({ id: h._id, ...h._source }));
    },

    // ---- get(id) ----------------------------------------------------------
    async get(id) {
      const { endpoint, index } = resolve();
      const data = await json(await fetch(`${endpoint}/${index}/_doc/${id}`));
      return { id: data._id, ...data._source };
    },

    // ---- create(data) -----------------------------------------------------
    async create(data) {
      const { endpoint, index } = resolve();
      await ensureIndex(endpoint, index);
      const now = new Date().toISOString();
      const doc = {
        created_date: now,
        updated_date: now,
        ...data,
      };
      const data_res = await json(await fetch(`${endpoint}/${index}/_doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      }));
      return { id: data_res._id, ...doc };
    },

    // ---- update(id, data) ------------------------------------------------
    async update(id, data) {
      const { endpoint, index } = resolve();
      const doc = { updated_date: new Date().toISOString(), ...data };
      await json(await fetch(`${endpoint}/${index}/_update/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc, doc_as_upsert: true }),
      }));
      return { id, ...doc };
    },

    // ---- delete(id) -------------------------------------------------------
    async delete(id) {
      const { endpoint, index } = resolve();
      await json(await fetch(`${endpoint}/${index}/_doc/${id}`, { method: 'DELETE' }));
      return { id, deleted: true };
    },

    // ---- deleteMany(query) ------------------------------------------------
    async deleteMany(query) {
      const { endpoint, index } = resolve();
      const esQuery = translateQuery(query);
      const data = await json(await fetch(`${endpoint}/${index}/_delete_by_query?refresh=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: esQuery }),
      }));
      return { deleted: data.deleted || 0, total: data.total || 0 };
    },

    // ---- bulkCreate(dataArray) -------------------------------------------
    async bulkCreate(dataArray) {
      const { endpoint, index } = resolve();
      await ensureIndex(endpoint, index);
      if (!Array.isArray(dataArray) || dataArray.length === 0) return [];
      const now = new Date().toISOString();
      const lines = [];
      const results = [];
      for (const item of dataArray) {
        const doc = { created_date: now, updated_date: now, ...item };
        lines.push(JSON.stringify({ index: { _index: index } }));
        lines.push(JSON.stringify(doc));
        results.push(doc);
      }
      const data = await json(await fetch(`${endpoint}/_bulk?refresh=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: lines.join('\n') + '\n',
      }));
      // Attach generated IDs
      const items = data.items || [];
      items.forEach((item, i) => {
        if (item.index?._id && results[i]) results[i].id = item.index._id;
      });
      return results;
    },

    // ---- bulkUpdate(dataArray)  [{id, ...fields}, ...] -------------------
    async bulkUpdate(dataArray) {
      const { endpoint, index } = resolve();
      if (!Array.isArray(dataArray) || dataArray.length === 0) return [];
      const lines = [];
      const results = [];
      for (const item of dataArray) {
        const { id, ...fields } = item;
        if (!id) continue;
        const doc = { updated_date: new Date().toISOString(), ...fields };
        lines.push(JSON.stringify({ update: { _index: index, _id: id } }));
        lines.push(JSON.stringify({ doc, doc_as_upsert: true }));
        results.push({ id, ...doc });
      }
      if (lines.length === 0) return [];
      await json(await fetch(`${endpoint}/_bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: lines.join('\n') + '\n',
      }));
      return results;
    },

    // ---- updateMany(query, updateData)  MongoDB operators → Painless -------
    async updateMany(query, updateData) {
      const { endpoint, index } = resolve();
      const esQuery = translateQuery(query);

      // Build Painless script from MongoDB operators
      let script = '';
      const params: any = {};
      if (updateData.$set) {
        for (const [k, v] of Object.entries(updateData.$set)) {
          script += `ctx._source.${k} = params.set_${k}; `;
          params[`set_${k}`] = v;
        }
      }
      if (updateData.$unset) {
        const fields = Array.isArray(updateData.$unset)
          ? updateData.$unset
          : Object.keys(updateData.$unset);
        for (const f of fields) {
          script += `ctx._source.remove('${f}'); `;
        }
      }
      if (updateData.$inc) {
        for (const [k, v] of Object.entries(updateData.$inc)) {
          script += `ctx._source.${k} = (ctx._source.${k} ?: 0) + params.inc_${k}; `;
          params[`inc_${k}`] = v;
        }
      }
      if (updateData.$push) {
        for (const [k, v] of Object.entries(updateData.$push)) {
          script += `if (ctx._source.${k} == null) ctx._source.${k} = []; ctx._source.${k}.add(params.push_${k}); `;
          params[`push_${k}`] = v;
        }
      }
      if (updateData.$pull) {
        for (const [k, v] of Object.entries(updateData.$pull)) {
          script += `if (ctx._source.${k} != null) ctx._source.${k}.removeIf(x -> x.equals(params.pull_${k})); `;
          params[`pull_${k}`] = v;
        }
      }
      script += "ctx._source.updated_date = params._now; ";
      params._now = new Date().toISOString();

      const data = await json(await fetch(`${endpoint}/${index}/_update_by_query?refresh=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: esQuery,
          script: { source: script, params },
        }),
      }));
      return { updated: data.updated || 0, total: data.total || 0 };
    },

    // ---- subscribe(callback) — lightweight polling diff -------------------
    subscribe(callback) {
      let lastSnapshot = null;
      let cancelled = false;
      const { endpoint, index } = resolve();

      const poll = async () => {
        if (cancelled) return;
        try {
          const data = await json(await fetch(`${endpoint}/${index}/_search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: { match_all: {} }, size: 5000 }),
          }));
          const hits = data.hits?.hits || [];
          const current = new Map(hits.map(h => [h._id, h._source]));
          const now = Date.now();

          if (lastSnapshot) {
            // Detect creates and updates
            for (const [id, source] of current) {
              const prev = lastSnapshot.get(id);
              if (!prev) {
                callback({ id, type: 'create', data: { id, ...(source as any) }, timestamp: new Date().toISOString() });
              } else if (JSON.stringify(prev) !== JSON.stringify(source)) {
                callback({ id, type: 'update', data: { id, ...(source as any) }, timestamp: new Date().toISOString() });
              }
            }
            // Detect deletes
            for (const [id] of lastSnapshot) {
              if (!current.has(id)) {
                callback({ id, type: 'delete', data: null, timestamp: new Date().toISOString() });
              }
            }
          }
          lastSnapshot = current;
        } catch {}
      };

      poll();
      const interval = setInterval(poll, 5000);

      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    },

    // ---- schema() — returns stored mapping fields -------------------------
    async schema() {
      const { endpoint, index } = resolve();
      try {
        const data = await json(await fetch(`${endpoint}/${index}/_mapping`));
        const mapping = data[index]?.mappings?.properties || {};
        const properties = {};
        for (const [field, def] of Object.entries(mapping)) {
          properties[field] = { type: (def as any).type || 'text' };
        }
        return { type: 'object', properties };
      } catch {
        return { type: 'object', properties: {} };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Proxy factory — client.entities.Persona.list() etc.
// ---------------------------------------------------------------------------

export function createEsEntities(getConfig) {
  const resolver = typeof getConfig === 'function' ? getConfig : () => getConfig;

  // Scan `_cat/indices` for every prefixed index and register unknown ones
  // so the Proxy + config cover them immediately. Fire-and-forget — the Proxy
  // resolves dynamically regardless, so first-access is never blocked.
  discoverPrefixedIndices(resolver);

  return new Proxy({}, {
    get(_target, entityName) {
      if (typeof entityName !== 'string' ||
          entityName === 'then' ||
          entityName.startsWith('_')) {
        return undefined;
      }
      return createEsEntityHandler(entityName, resolver);
    },
  });
}

// Convenience: a ready-to-use entities proxy using the default config getter.
export const esEntities = createEsEntities(getEsConfig);