const test = require('node:test');
const assert = require('node:assert/strict');
const { memberPaymentRequestSchema } = require('../dist/validators/member.validator.js');

const planId = '11111111-1111-4111-8111-111111111111';

test('member payment requests accept cash and offline UPI only', () => {
    assert.equal(memberPaymentRequestSchema.safeParse({ plan_id: planId, method: 'cash' }).success, true);
    assert.equal(memberPaymentRequestSchema.safeParse({ plan_id: planId, method: 'upi' }).success, true);
    assert.equal(memberPaymentRequestSchema.safeParse({ plan_id: planId, method: 'card' }).success, false);
    assert.equal(memberPaymentRequestSchema.safeParse({ plan_id: planId, method: 'online' }).success, false);
});

test('member payment requests require a valid plan UUID', () => {
    assert.equal(memberPaymentRequestSchema.safeParse({ plan_id: 'not-a-plan', method: 'cash' }).success, false);
});
