/**
 * Client-Side Request Batcher (Improvement #5)
 * Aggregates multiple rapid calls into a single batched execution.
 */

interface BatchItem<T> {
  args: any[];
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

export function createBatcher<T>(
  executor: (batch: any[][]) => Promise<T[]>,
  delayMs = 20
) {
  let queue: BatchItem<T>[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    const current = queue.splice(0);
    timer = null;
    if (current.length === 0) return;
    try {
      const results = await executor(current.map(item => item.args));
      current.forEach((item, i) => item.resolve(results[i]));
    } catch (err) {
      current.forEach(item => item.reject(err));
    }
  };

  return function batchedCall(...args: any[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({ args, resolve, reject });
      if (!timer) timer = setTimeout(flush, delayMs);
    });
  };
}