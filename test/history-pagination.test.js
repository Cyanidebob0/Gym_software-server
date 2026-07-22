const test = require('node:test');
const assert = require('node:assert/strict');
const {
    decodeCursor,
    encodeCursor,
    DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT,
    parseCursorPagination,
} = require('../dist/utils/pagination.js');
const {
    attendanceBatches,
    DEFAULT_ROW_COUNT,
    BATCH_SIZE,
} = require('../scripts/seed-large-attendance-fixture.js');

test('history cursors round-trip without exposing query syntax', () => {
    const values = {
        date: '2026-07-22',
        check_in: '18:30:00',
        id: '018f3a80-4b8f-7f19-8c6f-cc1ef15edfae',
    };
    const cursor = encodeCursor(values);

    assert.deepEqual(decodeCursor(cursor, Object.keys(values)), values);
    assert.equal(cursor.includes('2026-07-22'), false);
    assert.equal(DEFAULT_HISTORY_LIMIT, 25);
    assert.equal(MAX_HISTORY_LIMIT, 100);
});

test('malformed and incomplete history cursors are rejected', () => {
    assert.throws(() => decodeCursor('not-json', ['date', 'id']), /Invalid cursor/);
    assert.throws(() => decodeCursor(encodeCursor({ date: '2026-07-22' }), ['date', 'id']), /Invalid cursor/);
});

test('history limits default and clamp independently of offset pagination', () => {
    assert.deepEqual(parseCursorPagination({ query: {} }), { limit: 25, cursor: undefined });
    assert.deepEqual(parseCursorPagination({ query: { limit: '1000', cursor: 'abc' } }), {
        limit: 100,
        cursor: 'abc',
    });
    assert.equal(parseCursorPagination({ query: { limit: '-4' } }).limit, 1);
});

test('large attendance fixture yields at least 100k bounded insert rows', () => {
    let batches = 0;
    let rows = 0;
    for (const batch of attendanceBatches('fixture-member')) {
        batches += 1;
        rows += batch.length;
        assert.ok(batch.length <= BATCH_SIZE);
        assert.equal(batch[0].member_id, 'fixture-member');
    }

    assert.ok(DEFAULT_ROW_COUNT >= 100_000);
    assert.equal(rows, DEFAULT_ROW_COUNT);
    assert.equal(batches, Math.ceil(DEFAULT_ROW_COUNT / BATCH_SIZE));
});
