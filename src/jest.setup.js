import { jest } from '@jest/globals';
// In ESM mode jest doesn't inject the `jest` global automatically.
globalThis.jest = jest;
// Keep HOSTNAME as localhost so getOllamaEndpoint()/getElasticsearchEndpoint()
// resolve to http://127.0.0.1:11434 and http://127.0.0.1:9200.
process.env.HOSTNAME = '127.0.0.1';
// Global shims for Node test environment.
const _store = {};
globalThis.localStorage = {
    getItem: (k) => (k in _store ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    clear: () => { Object.keys(_store).forEach((k) => delete _store[k]); },
};
// Use real Node fetch (Node 18+ has it natively).
// Tests that need network isolation can override per-test via jest.spyOn(global, 'fetch').
if (typeof globalThis.fetch !== 'function') {
    // node-fetch fallback for older Node versions
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try {
        globalThis.fetch = require('node-fetch');
    }
    catch { /* Node 18+ has native fetch */ }
}
