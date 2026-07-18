import { clientLogger } from '../client-logger';

describe('clientLogger', () => {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  beforeEach(() => {
    logs.length = 0; warns.length = 0; errors.length = 0;
    console.log = (...args: any[]) => logs.push(args[0]);
    console.warn = (...args: any[]) => warns.push(args[0]);
    console.error = (...args: any[]) => errors.push(args[0]);
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  });

  test('info is silent', () => {
    clientLogger.info('hello', { a: 1 });
    expect(logs).toHaveLength(0);
  });

  test('warn is silent', () => {
    clientLogger.warn('careful');
    expect(warns).toHaveLength(0);
  });

  test('error is silent', () => {
    clientLogger.error('boom');
    expect(errors).toHaveLength(0);
  });

  test('timed returns the result and is silent', async () => {
    const res = await clientLogger.timed('op', async () => 42);
    expect(res).toBe(42);
    expect(logs).toHaveLength(0);
  });

  test('timed rethrows on failure and is silent', async () => {
    await expect(clientLogger.timed('bad', async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    expect(errors).toHaveLength(0);
  });
});