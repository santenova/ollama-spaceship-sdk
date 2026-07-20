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
/**
 * Global index prefix used to build every entity's default ES index name.
 * Stored in its own localStorage key so it survives shared ES config version bumps.
 * Default: "prompt-hub" → indices like prompt-hub-persona, prompt-hub-template, …
 */
export declare function getIndexPrefix(): string;
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
export declare function setIndexPrefix(prefix: any, discoveredIndices?: string[]): void;
export declare function getEsConfig(): {
    endpoint: any;
    enabled: any;
    indexPrefix: any;
    indices: any;
    _v: number;
};
export declare function saveEsConfig(cfg: any): void;
export declare function getEsEndpoint(): any;
/**
 * Shared index-creation helper — used internally and exported for feature
 * modules (conversation-memory, scheduled-jobs, ab-testing) so they don't
 * each duplicate the HEAD → 404 → PUT pattern.
 *
 * @param endpoint   ES base URL
 * @param index      Index name
 * @param mappings   Optional custom mappings body; defaults to BASE_MAPPING
 */
export declare function ensureEsIndex(endpoint: string, index: string, mappings?: Record<string, any>): Promise<void>;
export declare function createEsEntities(getConfig: any): {};
export declare const esEntities: {};
