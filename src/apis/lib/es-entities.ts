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

const ES_CONFIG_KEY = 'elasticsearch_config';
const ES_CONFIG_VERSION = 10; // bumped: global index prefix is now configurable via getIndexPrefix/setIndexPrefix

const INDEX_PREFIX_KEY = 'es_index_prefix';
const DEFAULT_INDEX_PREFIX = 'prompt-hub';

/** Auto-detect ES endpoint — mirrors getElasticsearchEndpoint() in apis/client.ts */
const _g: any = globalThis as any;
const _isBrowser = typeof _g.window !== 'undefined';
const detectEsEndpoint = () => {
  const host = _isBrowser
    ? _g.window.location.hostname
    : ((typeof process !== 'undefined' && process.env?.HOSTNAME) || 'localhost');
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');
  if (isLocal) {
    // Browser: use Vite proxy path. Node: connect directly to ES.
    return _isBrowser ? '/db' : 'http://localhost:9200';
  }
  return 'https://eu-vector-cloud.ngrok.dev';
};

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
};

const slugFor = (name) => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

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
export function setIndexPrefix(prefix, discoveredIndices?: string[]) {
  const p = (prefix || '').trim() || DEFAULT_INDEX_PREFIX;
  try { localStorage.setItem(INDEX_PREFIX_KEY, p); } catch {}

  // Register any discovered-but-unknown indices so the proxy covers them
  if (Array.isArray(discoveredIndices)) {
    const strip = p + '-';
    for (const idxName of discoveredIndices) {
      if (!idxName.startsWith(strip)) continue;
      const suffix = idxName.slice(strip.length);
      // Convert suffix to a PascalCase entity name, e.g. "my-things" → "MyThings"
      const entityName = suffix
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      if (!ENTITY_INDEX_SUFFIXES[entityName]) {
        (ENTITY_INDEX_SUFFIXES as any)[entityName] = suffix;
      }
    }
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
    endpoint: detectEsEndpoint(),
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
        endpoint: parsed.endpoint || fresh.endpoint,
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

// Fields that are mapped as date or numeric — sort directly (no .keyword).
const DATE_NUMERIC_FIELDS = new Set([
  'created_date', 'updated_date', 'use_count', 'rating', 'rating_count',
  'version', 'chunk_index', 'total_chunks', 'file_size', 'word_count',
  'message_count', 'score',
]);

// Sort string → ES sort array.
//   '-created_date'  → [{ created_date: { order: 'desc' } }]
//   'name'           → [{ 'name.keyword': { order: 'asc' } }]
const parseSort = (sort) => {
  if (!sort) return [{ created_date: { order: 'desc' } }, { _doc: { order: 'asc' } }];
  const entries = Array.isArray(sort) ? sort : [sort];
  return entries.map(s => {
    if (typeof s !== 'string') return s;
    const desc = s.startsWith('-');
    const field = desc ? s.slice(1) : s;
    // Use .keyword sub-field for text fields so lexicographic sort works
    const sortField = DATE_NUMERIC_FIELDS.has(field) ? field : `${field}.keyword`;
    return { [sortField]: { order: desc ? 'desc' : 'asc', unmapped_type: 'keyword' } };
  });
};

// MongoDB-style query → ES bool query.
//   { field: value }                        → term
//   { field: { $gte: n, $lt: m } }          → range
//   { field: { $in: [...] } }               → terms
//   { field: { $ne: value } }               → must_not term
//   { field: { $exists: true } }            → exists
//   { field: { $regex: 'pat' } }            → regexp
//   { $or: [q1, q2] }                       → should (min_should: 1)
//   { $and: [q1, q2] }                      → must
const translateQuery = (query) => {
  if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
    return { match_all: {} };
  }

  const must = [];
  const mustNot = [];
  const should = [];

  for (const [key, value] of Object.entries(query)) {
    if (key === '$or') {
      const clauses = (value as any).map(translateQuery);
      should.push(...clauses);
      continue;
    }
    if (key === '$and') {
      const clauses = (value as any).map(translateQuery);
      must.push(...clauses);
      continue;
    }
    if (key === '$nor') {
      const clauses = (value as any).map(translateQuery);
      mustNot.push(...clauses);
      continue;
    }

    // Operator object ($gte, $in, etc.)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ops: any = value;
      const esField = key;

      if (ops.$gte !== undefined || ops.$gt !== undefined ||
          ops.$lte !== undefined || ops.$lt !== undefined) {
        const range: any = {};
        if (ops.$gte !== undefined) range.gte = ops.$gte;
        if (ops.$gt !== undefined) range.gt = ops.$gt;
        if (ops.$lte !== undefined) range.lte = ops.$lte;
        if (ops.$lt !== undefined) range.lt = ops.$lt;
        must.push({ range: { [esField]: range } });
      }
      if (ops.$in !== undefined) {
        must.push({ terms: { [esField]: ops.$in } });
      }
      if (ops.$nin !== undefined) {
        mustNot.push({ terms: { [esField]: ops.$nin } });
      }
      if (ops.$ne !== undefined) {
        mustNot.push({ term: { [esField]: ops.$ne } });
      }
      if (ops.$exists !== undefined) {
        (ops.$exists ? must : mustNot).push({ exists: { field: esField } });
      }
      if (ops.$regex !== undefined) {
        must.push({ regexp: { [esField]: ops.$regex } });
      }
      if (ops.$not !== undefined) {
        mustNot.push(translateQuery({ [esField]: ops.$not }));
      }
      continue;
    }

    // Plain equality — use term on .keyword for strings (exact match, works for
    // filter/delete/updateMany), term directly for numbers/booleans.
    if (value !== null && value !== undefined) {
      if (typeof value === 'string') {
        if (value.includes('*') || value.includes('?')) {
          // Wildcard pattern e.g. "Marine*"
          must.push({ wildcard: { [`${key}.keyword`]: { value: value.toLowerCase(), case_insensitive: true } } });
        } else if (value.includes(' ')) {
          // Multi-word string — use match (full-text) for natural search
          must.push({ match: { [key]: { query: value, operator: 'and' } } });
        } else {
          // Single word — exact term match on .keyword
          must.push({ term: { [`${key}.keyword`]: value } });
        }
      } else {
        must.push({ term: { [key]: value } });
      }
    }
  }

  const bool: any = {};
  if (must.length) bool.must = must;
  if (mustNot.length) bool.must_not = mustNot;
  if (should.length) {
    bool.should = should;
    bool.minimum_should_match = 1;
  }

  return Object.keys(bool).length ? { bool } : { match_all: {} };
};

// Source field selection
const sourceFilter = (fields) => {
  if (!fields) return undefined;
  const arr = Array.isArray(fields) ? fields : String(fields).split(',');
  return { includes: arr };
};

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