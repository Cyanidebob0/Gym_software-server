const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
    path.resolve(__dirname, '..', 'migrations', '20260722_atomic_financial_workflows.sql'),
    'utf8',
);

test('financial migration defines every transactional workflow', () => {
    for (const rpc of [
        'financial_request_payment',
        'financial_create_payment',
        'financial_confirm_payment',
        'financial_reject_payment',
        'financial_activate_member',
        'financial_renew_member',
        'financial_create_refund',
        'financial_resolve_refund',
    ]) {
        assert.match(migration, new RegExp(`create or replace function public\\.${rpc}\\(`));
    }
});

test('financial migration serializes mutations and prevents duplicate pending payments', () => {
    assert.match(migration, /for update/gi);
    assert.match(migration, /payments_one_pending_per_member_idx/);
    assert.match(migration, /where status = 'pending'/);
    assert.match(migration, /payments_invoice_id_unique_idx/);
    assert.match(migration, /pg_advisory_xact_lock/);
});

test('financial RPCs are restricted to the service role', () => {
    assert.match(migration, /revoke all on function public\.financial_confirm_payment[\s\S]+from public, anon, authenticated/);
    assert.match(migration, /grant execute on function public\.financial_confirm_payment[\s\S]+to service_role/);
});
