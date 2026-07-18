const test = require('node:test');
const assert = require('node:assert/strict');
const { createRefundSchema, updateRefundSchema } = require('../dist/validators/refund.validator.js');

const paymentId = '11111111-1111-4111-8111-111111111111';

test('refund creation accepts a payment UUID without a client member ID', () => {
    const result = createRefundSchema.safeParse({
        payment_id: paymentId,
        amount: 500,
        reason: 'Medical cancellation',
    });
    assert.equal(result.success, true);
    assert.equal(Object.hasOwn(result.data, 'member_id'), false);
});

test('refund creation rejects zero, negative, and excessive-length input', () => {
    assert.equal(createRefundSchema.safeParse({ payment_id: paymentId, amount: 0, reason: 'Valid reason' }).success, false);
    assert.equal(createRefundSchema.safeParse({ payment_id: paymentId, amount: -1, reason: 'Valid reason' }).success, false);
    assert.equal(createRefundSchema.safeParse({ payment_id: paymentId, amount: 10, reason: 'x'.repeat(501) }).success, false);
});

test('refund status can only transition to approved or rejected', () => {
    assert.equal(updateRefundSchema.safeParse({ status: 'approved' }).success, true);
    assert.equal(updateRefundSchema.safeParse({ status: 'rejected' }).success, true);
    assert.equal(updateRefundSchema.safeParse({ status: 'pending' }).success, false);
});
