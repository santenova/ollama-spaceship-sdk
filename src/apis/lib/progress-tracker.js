/**
 * Progress tracker for streamed responses.
 *
 * Wraps raw tokens from a stream and emits augmented chunks with
 * cumulative metadata (token count, elapsed time).
 *
 * Usage:
 *   const tracker = createProgressTracker();
 *   const stream = client.streamResponse('chat', 'hello');
 *   stream.subscribe({
 *     next(chunk) {
 *       const { text, tokenIndex, elapsedMs, totalTokens } = tracker.next(chunk);
 *       // render or log augmented chunk
 *     },
 *     complete() {
 *       const summary = tracker.summary();
 *       // { totalTokens, totalElapsedMs, tokensPerSecond }
 *     },
 *   });
 */
export function createProgressTracker(location) {
    let tokenCount = 0;
    let startedAt = 0;
    let firstTokenAt = 0;
    let completedAt = 0;
    const tracker = {
        get count() {
            return tokenCount;
        },
        get elapsed() {
            if (startedAt === 0)
                return 0;
            return Date.now() - startedAt;
        },
        next(text) {
            if (tokenCount === 0) {
                startedAt = Date.now();
                firstTokenAt = startedAt;
            }
            const idx = tokenCount;
            tokenCount += 1;
            return {
                text,
                tokenIndex: idx,
                elapsedMs: Date.now() - startedAt,
                totalTokens: tokenCount,
                ...(location ? { lat: location.lat, lng: location.lng } : {}),
            };
        },
        summary() {
            completedAt = Date.now();
            const totalElapsedMs = completedAt - startedAt;
            return {
                totalTokens: tokenCount,
                totalElapsedMs,
                tokensPerSecond: totalElapsedMs > 0
                    ? Math.round((tokenCount / totalElapsedMs) * 1000)
                    : 0,
                timing: {
                    ttftMs: firstTokenAt - startedAt,
                    startedAt,
                    completedAt,
                },
            };
        },
        reset() {
            tokenCount = 0;
            startedAt = 0;
            firstTokenAt = 0;
            completedAt = 0;
        },
    };
    return tracker;
}
