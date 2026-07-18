import { createProgressTracker } from '../progress-tracker';

describe('createProgressTracker', () => {
  test('tracks token count and returns augmented chunks', () => {
    const tracker = createProgressTracker();
    expect(tracker.count).toBe(0);

    const c1 = tracker.next('hello');
    expect(c1.text).toBe('hello');
    expect(c1.tokenIndex).toBe(0);
    expect(c1.totalTokens).toBe(1);

    const c2 = tracker.next(' world');
    expect(c2.text).toBe(' world');
    expect(c2.tokenIndex).toBe(1);
    expect(c2.totalTokens).toBe(2);
    expect(tracker.count).toBe(2);
  });

  test('elapsed increases between tokens', async () => {
    const tracker = createProgressTracker();
    tracker.next('first');
    const t1 = tracker.elapsed;
    expect(t1).toBeGreaterThanOrEqual(0);

    await new Promise((r) => setTimeout(r, 10));
    tracker.next('second');
    expect(tracker.elapsed).toBeGreaterThan(t1);
  });

  test('summary includes correct totals and timing', () => {
    const tracker = createProgressTracker();
    tracker.next('a');
    tracker.next('b');
    tracker.next('c');

    const s = tracker.summary();
    expect(s.totalTokens).toBe(3);
    expect(s.timing.ttftMs).toBe(0); // first token = start
    expect(s.timing.startedAt).toBeGreaterThan(0);
    expect(s.timing.completedAt).toBeGreaterThanOrEqual(s.timing.startedAt);
    expect(s.tokensPerSecond).toBeGreaterThanOrEqual(0);
  });

  test('reset clears all state', () => {
    const tracker = createProgressTracker();
    tracker.next('hello');
    expect(tracker.count).toBe(1);

    tracker.reset();
    expect(tracker.count).toBe(0);
    expect(tracker.elapsed).toBe(0);

    const c = tracker.next('world');
    expect(c.tokenIndex).toBe(0); // reset back to zero
    expect(c.totalTokens).toBe(1);
  });

  test('elapsed is 0 before any token', () => {
    const tracker = createProgressTracker();
    expect(tracker.elapsed).toBe(0);
  });
});