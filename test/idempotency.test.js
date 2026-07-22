const test = require('node:test');
const assert = require('node:assert/strict');
const { financialMutation, requestIdempotencyKey } = require('../dist/utils/idempotency.js');

const fixedKey = '11111111-1111-4111-8111-111111111111';

test('financial request hashes are stable across object key order', () => {
    const first = financialMutation('confirm_payment', { paymentId: 'abc', nested: { a: 1, b: 2 } }, fixedKey);
    const second = financialMutation('confirm_payment', { nested: { b: 2, a: 1 }, paymentId: 'abc' }, fixedKey);
    assert.equal(first.requestHash, second.requestHash);
    assert.equal(first.idempotencyKey, fixedKey);
});

test('financial request hashes change when the operation or payload changes', () => {
    const base = financialMutation('confirm_payment', { paymentId: 'abc' }, fixedKey);
    const changedPayload = financialMutation('confirm_payment', { paymentId: 'def' }, fixedKey);
    const changedOperation = financialMutation('reject_payment', { paymentId: 'abc' }, fixedKey);
    assert.notEqual(base.requestHash, changedPayload.requestHash);
    assert.notEqual(base.requestHash, changedOperation.requestHash);
});

test('request idempotency keys accept UUIDs and reject malformed values', () => {
    assert.equal(requestIdempotencyKey({ get: () => fixedKey.toUpperCase() }), fixedKey);
    assert.throws(
        () => requestIdempotencyKey({ get: () => 'not-a-uuid' }),
        /Idempotency-Key must be a UUID/,
    );
});

test('request idempotency keys are generated when the client omits one', () => {
    const generated = requestIdempotencyKey({ get: () => undefined });
    assert.match(generated, /^[0-9a-f-]{36}$/);
});

