import { clientLogger } from '../client-logger';
describe('clientLogger', () => {
    const logs = [];
    const warns = [];
    const errors = [];
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    beforeEach(() => {
        logs.length = 0;
        warns.length = 0;
        errors.length = 0;
        console.log = (...args) => logs.push(args[0]);
        console.warn = (...args) => warns.push(args[0]);
        console.error = (...args) => errors.push(args[0]);
    });
    afterEach(() => {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
    });
    test('info logs to console.log with level INFO', () => {
        clientLogger.info('hello', { a: 1 });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toContain('[INFO]');
        expect(logs[0]).toContain('hello');
        expect(logs[0]).toContain('"a":1');
    });
    test('warn logs to console.warn', () => {
        clientLogger.warn('careful');
        expect(warns).toHaveLength(1);
        expect(warns[0]).toContain('[WARN]');
    });
    test('error logs to console.error', () => {
        clientLogger.error('boom');
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('[ERROR]');
    });
    test('timed returns the result and logs duration', async () => {
        const res = await clientLogger.timed('op', async () => 42);
        expect(res).toBe(42);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toContain('op');
        expect(logs[0]).toMatch(/\(\d+ms\)/);
    });
    test('timed rethrows and logs error on failure', async () => {
        await expect(clientLogger.timed('bad', async () => { throw new Error('fail'); })).rejects.toThrow('fail');
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('bad FAILED');
    });
});
