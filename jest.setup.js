// Global shims for Node test environment.
// Node 22 provides global fetch / AbortController / TextDecoder already.

const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { Object.keys(_store).forEach((k) => delete _store[k]); },
};

// Default fetch stub — individual tests override with jest.spyOn(global, 'fetch').
globalThis.fetch = (...args) => Promise.reject(new Error(`fetch not mocked: ${args[0]}`));