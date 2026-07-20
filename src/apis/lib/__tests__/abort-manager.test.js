import { abortManager } from '../abort-manager';
describe('abortManager', () => {
    afterEach(() => abortManager.cancelAll());
    test('create returns a controller and tracks active state', () => {
        const ctrl = abortManager.create('k1');
        expect(ctrl).toBeInstanceOf(AbortController);
        expect(abortManager.isActive('k1')).toBe(true);
        expect(ctrl.signal.aborted).toBe(false);
    });
    test('cancel aborts the signal and removes the key', () => {
        const ctrl = abortManager.create('k2');
        abortManager.cancel('k2');
        expect(ctrl.signal.aborted).toBe(true);
        expect(abortManager.isActive('k2')).toBe(false);
    });
    test('create with an existing key cancels the previous controller', () => {
        const ctrl1 = abortManager.create('dup');
        const ctrl2 = abortManager.create('dup');
        expect(ctrl1.signal.aborted).toBe(true);
        expect(ctrl2.signal.aborted).toBe(false);
        expect(abortManager.isActive('dup')).toBe(true);
    });
    test('cancelAll aborts every active controller', () => {
        const a = abortManager.create('a');
        const b = abortManager.create('b');
        abortManager.cancelAll();
        expect(a.signal.aborted).toBe(true);
        expect(b.signal.aborted).toBe(true);
        expect(abortManager.isActive('a')).toBe(false);
        expect(abortManager.isActive('b')).toBe(false);
    });
    test('signal returns the registered controller signal', () => {
        const ctrl = abortManager.create('sig');
        expect(abortManager.signal('sig')).toBe(ctrl.signal);
        expect(abortManager.signal('missing')).toBeUndefined();
    });
});
