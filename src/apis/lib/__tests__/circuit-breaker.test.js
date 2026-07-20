import { jest } from '@jest/globals';
import { createCircuitBreaker } from '../circuit-breaker';
describe('createCircuitBreaker', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    test('starts closed and allows calls', () => {
        const cb = createCircuitBreaker('t', { failureThreshold: 3, recoveryTimeMs: 400 });
        expect(cb.state).toBe('closed');
        expect(cb.canCall()).toBe(true);
    });
    test('stays closed below failure threshold', () => {
        const cb = createCircuitBreaker('t', { failureThreshold: 3, recoveryTimeMs: 400 });
        cb.onFailure();
        cb.onFailure();
        expect(cb.state).toBe('closed');
    });
    test('opens after reaching failure threshold and blocks calls', () => {
        const cb = createCircuitBreaker('t', { failureThreshold: 3, recoveryTimeMs: 400 });
        cb.onFailure();
        cb.onFailure();
        cb.onFailure();
        expect(cb.state).toBe('open');
        expect(cb.canCall()).toBe(false);
    });
    test('transitions to half-open after recovery time, then closed on success', () => {
        const cb = createCircuitBreaker('t', { failureThreshold: 2, recoveryTimeMs: 400 });
        cb.onFailure();
        cb.onFailure();
        expect(cb.state).toBe('open');
        jest.advanceTimersByTime(450);
        expect(cb.canCall()).toBe(true);
        expect(cb.state).toBe('half-open');
        cb.onSuccess();
        expect(cb.state).toBe('closed');
        expect(cb.canCall()).toBe(true);
    });
    test('reset returns to closed', () => {
        const cb = createCircuitBreaker('t', { failureThreshold: 2, recoveryTimeMs: 400 });
        cb.onFailure();
        cb.onFailure();
        expect(cb.state).toBe('open');
        cb.reset();
        expect(cb.state).toBe('closed');
    });
    test('onStateChange callback fires on transitions', () => {
        const changes = [];
        const cb = createCircuitBreaker('t', { failureThreshold: 1, recoveryTimeMs: 100, onStateChange: (s) => changes.push(s) });
        cb.onFailure();
        expect(changes).toContain('open');
    });
});
