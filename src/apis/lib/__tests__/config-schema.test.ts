import { validateClientConfig } from '../config-schema';

describe('validateClientConfig', () => {
  test('valid config passes', () => {
    const r = validateClientConfig({
      serverUrl: 'http://x', appId: 'a', model: 'm',
      ollamaEndpoints: ['http://y'], headers: {},
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  test('missing serverUrl is reported', () => {
    const r = validateClientConfig({ appId: 'a', model: 'm', ollamaEndpoints: ['http://y'], headers: {} });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/serverUrl/);
  });

  test('missing appId is reported', () => {
    const r = validateClientConfig({ serverUrl: 'http://x', model: 'm', ollamaEndpoints: ['http://y'], headers: {} });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/appId/);
  });

  test('missing model is reported', () => {
    const r = validateClientConfig({ serverUrl: 'http://x', appId: 'a', ollamaEndpoints: ['http://y'], headers: {} });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/model/);
  });

  test('empty ollamaEndpoints is reported', () => {
    const r = validateClientConfig({ serverUrl: 'http://x', appId: 'a', model: 'm', ollamaEndpoints: [], headers: {} });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/ollamaEndpoints/);
  });

  test('non-object headers is reported', () => {
    const r = validateClientConfig({ serverUrl: 'http://x', appId: 'a', model: 'm', ollamaEndpoints: ['http://y'], headers: 5 as any });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/headers/);
  });
});