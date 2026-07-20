/**
 * Client-Side Request Batcher (Improvement #5)
 * Aggregates multiple rapid calls into a single batched execution.
 */
export function createBatcher(executor, delayMs = 20) {
    let queue = [];
    let timer = null;
    const flush = async () => {
        const current = queue.splice(0);
        timer = null;
        if (current.length === 0)
            return;
        try {
            const results = await executor(current.map(item => item.args));
            current.forEach((item, i) => item.resolve(results[i]));
        }
        catch (err) {
            current.forEach(item => item.reject(err));
        }
    };
    return function batchedCall(...args) {
        return new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject });
            if (!timer)
                timer = setTimeout(flush, delayMs);
        });
    };
}
