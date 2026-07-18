import { telemetry } from '../telemetry';

describe('telemetry', () => {
  test('emit delivers payload with event + timestamp to subscribers', () => {
    const received: any[] = [];
    telemetry.on('client:request-start', (p) => received.push(p));
    telemetry.emit('client:request-start', { tool: 'InvokeLLM' });
    expect(received).toHaveLength(1);
    expect(received[0].event).toBe('client:request-start');
    expect(received[0].tool).toBe('InvokeLLM');
    expect(typeof received[0].timestamp).toBe('number');
  });

  test('unsubscribe stops further delivery', () => {
    const received: any[] = [];
    const unsub = telemetry.on('client:error', (p) => received.push(p));
    telemetry.emit('client:error', { ok: false });
    unsub();
    telemetry.emit('client:error', { ok: false });
    expect(received).toHaveLength(1);
  });

  test('multiple handlers all receive events', () => {
    const a: any[] = [];
    const b: any[] = [];
    telemetry.on('client:circuit-open', (p) => a.push(p));
    telemetry.on('client:circuit-open', (p) => b.push(p));
    telemetry.emit('client:circuit-open', { name: 'cb1' });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  test('handler errors are swallowed and do not break other handlers', () => {
    const after: any[] = [];
    telemetry.on('client:fallback-triggered', () => { throw new Error('boom'); });
    telemetry.on('client:fallback-triggered', (p) => after.push(p));
    expect(() => telemetry.emit('client:fallback-triggered', {})).not.toThrow();
    expect(after).toHaveLength(1);
  });

  test('client:limits-updated delivers limits payload to subscribers', () => {
    const received: any[] = [];
    telemetry.on('client:limits-updated', (p) => received.push(p));
    telemetry.emit('client:limits-updated', { limits: { maxCalls: 5, windowMs: 1000 } });
    expect(received).toHaveLength(1);
    expect(received[0].event).toBe('client:limits-updated');
    expect(received[0].limits).toEqual({ maxCalls: 5, windowMs: 1000 });
    expect(typeof received[0].timestamp).toBe('number');
  });

  test('client:limits-updated with null limits (unlimited)', () => {
    const received: any[] = [];
    telemetry.on('client:limits-updated', (p) => received.push(p));
    telemetry.emit('client:limits-updated', { limits: null });
    expect(received).toHaveLength(1);
    expect(received[0].limits).toBeNull();
  });
});