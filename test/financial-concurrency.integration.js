/* Run after applying 20260722_atomic_financial_workflows.sql:
 * npm run test:financial-concurrency
 * The script deletes every fixture and idempotency key it creates.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const ids = { authUsers: [], members: [], payments: [], keys: [] };
const today = new Date().toISOString().slice(0, 10);
let phoneSequence = 0;

const nextPhone = () => `8${String(Date.now()).slice(-7)}${String(phoneSequence++).padStart(2, '0')}`;
const nextKey = () => {
    const value = randomUUID();
    ids.keys.push(value);
    return value;
};
const rpc = async (name, args) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
};
const createMember = async (planId, status = 'approved') => {
    const { data, error } = await supabase.from('members').insert({
        name: `Atomic Test ${randomUUID().slice(0, 8)}`,
        phone: nextPhone(),
        plan_id: planId,
        status,
        access_state: 'normal',
        join_date: today,
        expiry_date: today,
    }).select('id').single();
    if (error) throw error;
    ids.members.push(data.id);
    return data.id;
};
const createAuthenticatedMember = async (planId) => {
    const email = `atomic-${randomUUID()}@example.com`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: `Atomic!${randomUUID()}9a`,
        email_confirm: true,
    });
    if (authError || !authData.user) throw authError || new Error('Failed to create auth fixture');
    ids.authUsers.push(authData.user.id);
    const { data, error } = await supabase.from('members').insert({
        user_id: authData.user.id,
        name: `Atomic Request ${randomUUID().slice(0, 8)}`,
        phone: nextPhone(),
        email,
        plan_id: planId,
        status: 'approved',
        access_state: 'normal',
        join_date: today,
        expiry_date: today,
    }).select('id').single();
    if (error) throw error;
    ids.members.push(data.id);
    return { memberId: data.id, userId: authData.user.id };
};
const createPayment = async (memberId, plan, status, amount = plan.price) => {
    const { data, error } = await supabase.from('payments').insert({
        member_id: memberId,
        plan_id: plan.id,
        amount,
        mode: 'offline',
        method: 'cash',
        status,
        date: today,
        invoice_id: `TEST-${randomUUID()}`,
    }).select('id').single();
    if (error) throw error;
    ids.payments.push(data.id);
    return data.id;
};
const cleanup = async () => {
    if (ids.payments.length) await supabase.from('refunds').delete().in('payment_id', ids.payments);
    if (ids.payments.length) await supabase.from('payments').delete().in('id', ids.payments);
    if (ids.members.length) await supabase.from('members').delete().in('id', ids.members);
    if (ids.keys.length) await supabase.from('financial_idempotency_keys').delete().in('idempotency_key', ids.keys);
    for (const userId of ids.authUsers) await supabase.auth.admin.deleteUser(userId);
};

(async () => {
    try {
        const { data: plans, error: planError } = await supabase
            .from('plans').select('id, price').eq('is_active', true).limit(1);
        if (planError || !plans?.[0]) throw planError || new Error('An active plan is required');
        const plan = plans[0];

        const requestFixture = await createAuthenticatedMember(plan.id);
        const paymentRequests = await Promise.all(Array.from({ length: 12 }, () => rpc(
            'financial_request_payment',
            {
                p_user_id: requestFixture.userId,
                p_plan_id: plan.id,
                p_method: 'cash',
                p_invoice_id: `TEST-${randomUUID()}`,
                p_idempotency_key: nextKey(),
                p_request_hash: 'same-payment-request',
            },
        )));
        assert.equal(new Set(paymentRequests.map((item) => item.id)).size, 1);
        ids.payments.push(paymentRequests[0].id);
        const { count: pendingCount, error: pendingError } = await supabase
            .from('payments')
            .select('*', { count: 'exact', head: true })
            .eq('member_id', requestFixture.memberId)
            .eq('status', 'pending');
        if (pendingError) throw pendingError;
        assert.equal(pendingCount, 1);

        const confirmMember = await createMember(plan.id);
        const pendingPayment = await createPayment(confirmMember, plan, 'pending');
        const confirmArgs = {
            p_payment_id: pendingPayment,
            p_idempotency_key: nextKey(),
            p_request_hash: 'same-confirm-request',
        };
        const confirmations = await Promise.all(
            Array.from({ length: 12 }, () => rpc('financial_confirm_payment', confirmArgs)),
        );
        assert.equal(new Set(confirmations.map((item) => item.payment_id)).size, 1);
        const { data: confirmedRows } = await supabase.from('payments').select('status').eq('id', pendingPayment);
        assert.deepEqual(confirmedRows.map((item) => item.status), ['completed']);

        const refundMember = await createMember(plan.id, 'active');
        const completedPayment = await createPayment(refundMember, plan, 'completed', 1000);
        const replayArgs = {
            p_payment_id: completedPayment,
            p_amount: 100,
            p_reason: 'Idempotency concurrency test',
            p_idempotency_key: nextKey(),
            p_request_hash: 'same-refund-request',
        };
        const replayedRefunds = await Promise.all(
            Array.from({ length: 12 }, () => rpc('financial_create_refund', replayArgs)),
        );
        assert.equal(new Set(replayedRefunds.map((item) => item.id)).size, 1);

        const competing = await Promise.allSettled([600, 600].map((amount) => rpc('financial_create_refund', {
            p_payment_id: completedPayment,
            p_amount: amount,
            p_reason: 'Competing refund test',
            p_idempotency_key: nextKey(),
            p_request_hash: `competing-${randomUUID()}`,
        })));
        assert.equal(competing.filter((item) => item.status === 'fulfilled').length, 1);
        const { data: refunds, error: refundError } = await supabase
            .from('refunds').select('amount').eq('payment_id', completedPayment).in('status', ['pending', 'approved']);
        if (refundError) throw refundError;
        assert.ok(refunds.reduce((sum, item) => sum + Number(item.amount), 0) <= 1000);

        console.log('Financial concurrency tests passed');
    } finally {
        await cleanup();
    }
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
