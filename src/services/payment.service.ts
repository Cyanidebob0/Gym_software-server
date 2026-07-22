import supabase from '../config/supabase';
import { createAsyncCache } from '../utils/async-cache';
import { randomBytes } from 'node:crypto';
import { financialMutation } from '../utils/idempotency';

const paymentStatsCache = createAsyncCache<{ monthly_revenue: number; yearly_revenue: number }>(15_000);
const pendingCountCache = createAsyncCache<{ count: number }>(5_000);

export const invalidatePaymentCaches = () => {
    paymentStatsCache.invalidate();
    pendingCountCache.invalidate();
};

export const generateInvoiceId = async (): Promise<string> => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}`;
    // Counting existing invoices races when two payments are created at once.
    // A 40-bit cryptographic suffix avoids that database round trip and makes
    // concurrent collisions practically negligible for a single-gym system.
    return `${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`;
};

export const getAll = async (limit?: number, offset?: number) => {
    let query = supabase
        .from('payments')
        .select('*, members(name, email), plans(name)')
        .order('date', { ascending: false })
        .order('id', { ascending: false });

    if (limit !== undefined) query = query.range(offset || 0, (offset || 0) + limit - 1);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data.map((p: any) => ({
        ...p,
        member_name: p.members?.name ?? null,
        member_email: p.members?.email ?? null,
        plan_name: p.plans?.name ?? null,
        members: undefined,
        plans: undefined,
    }));
};

export const getById = async (paymentId: string) => {
    const { data, error } = await supabase
        .from('payments')
        .select('*, members(name, email), plans(name)')
        .eq('id', paymentId)
        .single();

    if (error || !data) throw new Error('Payment not found');
    return {
        ...data,
        member_name: data.members?.name ?? null,
        member_email: data.members?.email ?? null,
        plan_name: data.plans?.name ?? null,
        members: undefined,
        plans: undefined,
    };
};

export const create = async (body: Record<string, any>, idempotencyKey?: string) => {
    const invoiceId = await generateInvoiceId();
    const mutation = financialMutation('create_payment', body, idempotencyKey);
    const { data, error } = await supabase.rpc('financial_create_payment', {
        p_member_id: body.member_id,
        p_plan_id: body.plan_id ?? null,
        p_amount: body.amount,
        p_mode: body.mode,
        p_method: body.method,
        p_status: body.status ?? 'completed',
        p_date: body.date ?? null,
        p_invoice_id: invoiceId,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error || !data) throw new Error(error?.message ?? 'Failed to create payment');
    invalidatePaymentCaches();
    return data;
};

// Aggregated in SQL with bounded date predicates; the yearly total is capped
// at the end of the current month (payment dates cannot be in the future).
export const getStats = async () => paymentStatsCache.get(async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const startOfYear = `${now.getFullYear()}-01-01`;

    const { data, error } = await supabase.rpc('revenue_overview', {
        p_from: startOfYear,
        p_to: endOfMonth,
        p_month_start: startOfMonth,
        p_year_start: startOfYear,
    });
    if (error) throw new Error(error.message);

    return {
        monthly_revenue: Number(data?.monthly_revenue) || 0,
        yearly_revenue: Number(data?.yearly_revenue) || 0,
    };
});

export const getPendingCount = async () => pendingCountCache.get(async () => {
    const { count, error } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
});

export const confirm = async (paymentId: string, idempotencyKey?: string) => {
    const mutation = financialMutation('confirm_payment', { paymentId }, idempotencyKey);
    const { error } = await supabase.rpc('financial_confirm_payment', {
        p_payment_id: paymentId,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error) throw new Error(error.message);

    invalidatePaymentCaches();
    return getById(paymentId);
};

export const reject = async (paymentId: string, idempotencyKey?: string) => {
    const mutation = financialMutation('reject_payment', { paymentId }, idempotencyKey);
    const { error } = await supabase.rpc('financial_reject_payment', {
        p_payment_id: paymentId,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error) throw new Error(error.message);

    invalidatePaymentCaches();
    return getById(paymentId);
};
