import supabase from '../config/supabase';
import { runSteps } from '../utils/transaction';
import { createAsyncCache } from '../utils/async-cache';
import { randomBytes } from 'node:crypto';

const paymentStatsCache = createAsyncCache<{ monthly_revenue: number; yearly_revenue: number }>(15_000);
const pendingCountCache = createAsyncCache<{ count: number }>(5_000);

export const invalidatePaymentCaches = () => {
    paymentStatsCache.invalidate();
    pendingCountCache.invalidate();
};

const addDays = (date: string, days: number): string => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
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

export const create = async (body: Record<string, any>) => {
    const invoice_id = await generateInvoiceId();
    const { data, error } = await supabase
        .from('payments')
        .insert({ ...body, invoice_id })
        .select()
        .single();

    if (error) throw new Error(error.message);
    invalidatePaymentCaches();
    return data;
};

export const getStats = async () => paymentStatsCache.get(async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const startOfYear = `${now.getFullYear()}-01-01`;

    const [{ data: monthlyData, error: e1 }, { data: yearlyData, error: e2 }] = await Promise.all([
        supabase
            .from('payments')
            .select('amount')
            .eq('status', 'completed')
            .gte('date', startOfMonth)
            .lte('date', endOfMonth),
        supabase
            .from('payments')
            .select('amount')
            .eq('status', 'completed')
            .gte('date', startOfYear),
    ]);

    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);

    return {
        monthly_revenue: (monthlyData || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0),
        yearly_revenue: (yearlyData || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0),
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

export const confirm = async (paymentId: string) => {
    const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select('id, member_id, plan_id, amount, method, status, members(id, status, access_state, plan_id, join_date, expiry_date), plans(id, name, duration_days, price)')
        .eq('id', paymentId)
        .single();

    if (paymentError || !payment) throw new Error('Payment request not found');
    if (payment.status !== 'pending') throw new Error('This payment request has already been handled');

    const member = payment.members as any;
    const plan = payment.plans as any;
    if (!member || !plan) throw new Error('Payment member or plan no longer exists');
    const isInitialPayment = member.status === 'approved';
    const canConfirmPayment = ['approved', 'active', 'expired', 'expiring_soon'].includes(member.status);
    if (!canConfirmPayment) throw new Error('Member is not eligible for this payment');
    if (member.access_state === 'blocked' || member.access_state === 'cancelled') {
        throw new Error('Member access is restricted');
    }
    if (Number(payment.amount) !== Number(plan.price)) throw new Error('Payment amount does not match the plan price');
    if (isInitialPayment && member.plan_id && member.plan_id !== plan.id) {
        throw new Error('Payment plan does not match the assigned plan');
    }

    const today = new Date().toISOString().slice(0, 10);
    const joinDate = member.join_date || today;
    const renewalBase = !isInitialPayment && member.expiry_date && member.expiry_date > today
        ? member.expiry_date
        : today;
    const expiryDate = isInitialPayment
        ? (member.expiry_date || addDays(joinDate, plan.duration_days))
        : addDays(renewalBase, plan.duration_days);
    const status = 'active';

    await runSteps([
        {
            execute: async () => {
                const { data, error } = await supabase
                    .from('payments')
                    .update({ status: 'completed' })
                    .eq('id', paymentId)
                    .eq('status', 'pending')
                    .select()
                    .single();
                if (error || !data) throw new Error(error?.message || 'Payment request was already handled');
                return data;
            },
            rollback: async () => {
                await supabase.from('payments').update({ status: 'pending' }).eq('id', paymentId);
            },
        },
        {
            execute: async () => {
                const { data, error } = await supabase
                    .from('members')
                    .update({
                        plan_id: plan.id,
                        join_date: joinDate,
                        expiry_date: expiryDate,
                        status,
                    })
                    .eq('id', member.id)
                    .eq('status', member.status)
                    .select()
                    .single();
                if (error || !data) throw new Error(error?.message || 'Failed to activate member');
                return data;
            },
            rollback: async () => {
                await supabase.from('members').update({
                    plan_id: member.plan_id,
                    join_date: member.join_date,
                    expiry_date: member.expiry_date,
                    status: member.status,
                }).eq('id', member.id);
            },
        },
    ]);

    invalidatePaymentCaches();
    return getById(paymentId);
};

export const reject = async (paymentId: string) => {
    const { data, error } = await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .eq('status', 'pending')
        .select('id')
        .single();

    if (error || !data) {
        throw new Error('Payment request was not found or has already been handled');
    }

    invalidatePaymentCaches();
    return getById(paymentId);
};
