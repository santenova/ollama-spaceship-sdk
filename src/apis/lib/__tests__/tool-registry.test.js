import { toolRegistry } from '../tool-registry';
describe('toolRegistry', () => {
    afterEach(() => {
        toolRegistry.list().forEach((n) => toolRegistry.unregister(n));
    });
    test('register and call a tool', async () => {
        toolRegistry.register('echo', async (x) => `echo:${x}`);
        const result = await toolRegistry.call('echo', 'hi');
        expect(result).toBe('echo:hi');
        expect(toolRegistry.has('echo')).toBe(true);
    });
    test('call throws for unregistered tool', async () => {
        await expect(toolRegistry.call('nope')).rejects.toThrow('is not registered');
    });
    test('list returns registered names', () => {
        toolRegistry.register('a', async () => 1);
        toolRegistry.register('b', async () => 2);
        const names = toolRegistry.list();
        expect(names).toContain('a');
        expect(names).toContain('b');
    });
    test('unregister removes a tool', async () => {
        toolRegistry.register('temp', async () => 1);
        toolRegistry.unregister('temp');
        expect(toolRegistry.has('temp')).toBe(false);
    });
    test('toCoreIntegrations builds an object of handlers', async () => {
        toolRegistry.register('inc', async (n) => n + 1);
        const core = toolRegistry.toCoreIntegrations();
        expect(typeof core.inc).toBe('function');
        expect(await core.inc(4)).toBe(5);
    });
});
