// Process-local TTL memoization. These caches are a performance layer only:
// correctness must never depend on a hit, a miss, or invalidate() being
// observed — invalidation does not propagate across instances, so under
// horizontal scaling the TTL is the maximum staleness bound. Never gate an
// authorization decision on cached state. Inventory and staleness contract:
// server/docs/caching.md.
export const createAsyncCache = <T>(ttlMs: number) => {
    let value: T | undefined;
    let expiresAt = 0;
    let pending: Promise<T> | null = null;
    let generation = 0;

    return {
        get(loader: () => Promise<T>): Promise<T> {
            if (value !== undefined && expiresAt > Date.now()) return Promise.resolve(value);
            if (pending) return pending;

            const loadGeneration = generation;
            const request = loader()
                .then((nextValue) => {
                    if (generation === loadGeneration) {
                        value = nextValue;
                        expiresAt = Date.now() + ttlMs;
                    }
                    return nextValue;
                })
                .finally(() => {
                    if (pending === request) pending = null;
                });
            pending = request;
            return request;
        },
        invalidate(): void {
            generation++;
            value = undefined;
            expiresAt = 0;
            pending = null;
        },
    };
};
