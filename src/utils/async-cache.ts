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
