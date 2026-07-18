import { jest } from '@jest/globals';
import { createBatcher } from '../request-batcher';

describe('createBatcher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('coalesces calls within the window into a single executor call', async () => {
    let execCount = 0;
    const executor = async (batch: any[][]) => { execCount++; return batch.map(([n]) => n * 2); };
    const batched = createBatcher<number>(executor, 20);

    const p = Promise.all([batched(1), batched(2), batched(3)]);
    jest.advanceTimersByTime(30);
    const [a, b, c] = await p;

    expect(execCount).toBe(1);
    expect([a, b, c]).toEqual([2, 4, 6]);
  });

  test('rejects all pending calls when executor throws', async () => {
    const executor = async (_batch: any[][]) => { throw new Error('exec-fail'); };
    const batched = createBatcher<number>(executor, 10);

    const p = Promise.allSettled([batched(1), batched(2)]);
    jest.advanceTimersByTime(20);
    const results = await p;

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  test('does not flush an empty queue', async () => {
    let execCount = 0;
    const executor = async (b: any[][]) => { execCount++; return b.map(() => 1); };
    createBatcher<number>(executor, 5);
    jest.advanceTimersByTime(50);
    expect(execCount).toBe(0);
  });
});