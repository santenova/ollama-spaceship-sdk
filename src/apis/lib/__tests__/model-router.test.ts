import { modelRouter } from '../model-router';

const EP = 'http://localhost:11434';

function seedCache(map: Record<string, Record<string, number>>) {
  localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));
  localStorage.setItem('model_router_capability_cache', JSON.stringify({ endpoint: EP, map, ts: Date.now() }));
}

describe('modelRouter', () => {
  beforeEach(() => {
    localStorage.clear();
    modelRouter.invalidateCache();
  });

  afterEach(() => {
    modelRouter.invalidateCache();
  });

  test('resolve returns defaultModel when capability cache is empty', () => {
    const m = modelRouter.resolve({ TaskType: 'chat', Speed: 100, defaultModel: 'fallback-model' });
    expect(m).toBe('fallback-model');
  });

  test('resolve positional form returns defaultModel when cache is empty', () => {
    const m = modelRouter.resolve('chat', 'prompt', 'fallback-positional');
    expect(m).toBe('fallback-positional');
  });

  test('resolve with Speed=100 returns the smallest-param model', () => {
    seedCache({ completion: { big: 5000, small: 500, mid: 2500 } });
    const m = modelRouter.resolve({ TaskType: 'chat', Speed: 100, defaultModel: 'fb' });
    expect(m).toBe('small');
  });

  test('resolve with Speed=0 returns the largest-param model', () => {
    seedCache({ completion: { big: 5000, small: 500, mid: 2500 } });
    const m = modelRouter.resolve({ TaskType: 'chat', Speed: 0, defaultModel: 'fb' });
    expect(m).toBe('big');
  });

  test('resolve maps vision task to vision capability', () => {
    seedCache({ vision: { llava: 7000 }, completion: { qwen: 500 } });
    const m = modelRouter.resolve({ TaskType: 'vision', Speed: 100, defaultModel: 'fb' });
    expect(m).toBe('llava');
  });

  test('resolve with requiredCaps filters to models with all listed capabilities', () => {
    seedCache({
      completion: { a: 1000, b: 2000 },
      tools: { a: 1000, c: 3000 },
      thinking: { a: 1000, c: 3000 },
    });
    const m = modelRouter.resolve({ TaskType: 'chat', Speed: 100, defaultModel: 'fb', requiredCaps: ['tools', 'thinking'] });
    expect(m).toBe('a');
  });

  test('resolve with requiredCaps returns default when no model satisfies all', () => {
    seedCache({
      completion: { a: 1000 },
      tools: { b: 2000 },
      thinking: { c: 3000 },
    });
    const m = modelRouter.resolve({ TaskType: 'chat', Speed: 100, defaultModel: 'fb', requiredCaps: ['tools', 'thinking'] });
    expect(m).toBe('fb');
  });

  test('invalidateCache clears the in-memory cache so next resolve re-reads storage', () => {
    seedCache({ completion: { first: 100, second: 200 } });
    expect(modelRouter.resolve({ TaskType: 'chat', Speed: 100, defaultModel: 'fb' })).toBe('first');
    seedCache({ completion: { only: 999 } });
    modelRouter.invalidateCache();
    expect(modelRouter.resolve({ TaskType: 'chat', Speed: 100, defaultModel: 'fb' })).toBe('only');
  });
});