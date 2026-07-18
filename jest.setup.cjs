/**
 * Jest setup — polyfills for Node environment.
 * Provides fetch, localStorage, and TextDecoder/Encoder so the client SDK
 * works without a browser.
 */

// localStorage shim (in-memory)
const _store = {};
global.localStorage = {
  getItem: (key) => (key in _store ? _store[key] : null),
  setItem: (key, val) => { _store[key] = String(val); },
  removeItem: (key) => { delete _store[key]; },
  clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
};

// TextDecoder/Encoder (Node 18+ has these natively, but ensure availability)
if (typeof global.TextDecoder === 'undefined') {
  const util = require('util');
  global.TextDecoder = util.TextDecoder;
  global.TextEncoder = util.TextEncoder;
}

// AbortSignal.timeout polyfill (Node 17+)
if (typeof AbortSignal.timeout === 'undefined') {
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}
