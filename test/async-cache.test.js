const test = require('node:test');
const assert = require('node:assert/strict');
const { createAsyncCache } = require('../dist/utils/async-cache.js');

test('async cache coalesces concurrent loads and reuses the result', async () => {
    const cache = createAsyncCache(1000);
    let calls = 0;
    const loader = async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 42 };
    };

    const [first, second] = await Promise.all([cache.get(loader), cache.get(loader)]);
    const third = await cache.get(loader);

    assert.deepEqual(first, { value: 42 });
    assert.equal(second, first);
    assert.equal(third, first);
    assert.equal(calls, 1);
});

test('async cache reloads after invalidation', async () => {
    const cache = createAsyncCache(1000);
    let calls = 0;
    const loader = async () => ++calls;

    assert.equal(await cache.get(loader), 1);
    cache.invalidate();
    assert.equal(await cache.get(loader), 2);
});
