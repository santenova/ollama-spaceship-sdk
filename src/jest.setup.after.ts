// Runs after the Jest test framework is installed (setupFilesAfterEnv).
// afterAll/beforeAll/etc. are available here.

import { markJestTornDown } from './apis/lib/client-logger';

// After every test suite: mark logger as torn down first so any in-flight
// async continuations (e.g. clientLogger.timed catch blocks) are silenced,
// then drain the microtask / macrotask queue.
afterAll(async () => {
  markJestTornDown();
  await new Promise<void>((resolve) => setImmediate(resolve));
});