import supabase from '../config/supabase';
import { get as getSettings } from './settings.service';
import { generateInvoiceId } from './payment.service';
import { runSteps } from '../utils/transaction';
import { createAsyncCache } from '../utils/async-cache';

const memberStatsCache = createAsyncCache<Record<string, number>>(10_000);

const computeStatus = (
    member: any,
    reminderDays: number,
    graceDays: number,
): string => {
    if (member.access_state === 'blocked') return 'blocked';
    if (member.access_state === 'cancelled') return 'cancelled';
    if (!member.expiry_date || !['active', 'expiring_soon', 'expired'].includes(member.status)) {
        return member.status;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(member.expiry_date);
    expiry.setHours(0, 0, 0, 0);

    const msPerDay = 86400000;
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / msPerDay);

    if (daysUntilExpiry > reminderDays) return 'active';
    if (daysUntilExpiry > 0) return 'expiring_soon';
    if (daysUntilExpiry >= -graceDays) return 'expiring_soon';
    return 'expired';
};

export { computeStatus };

export const updateAccessState = async (
    memberId: string,
    accessState: 'normal' | 'cancelled' | 'blocked',
) => {
    const { data: member, error: readError } = await supabase
        .from('members')
        .select('id, status, access_state')
        .eq('id', memberId)
        .single();
    if (readError || !member) throw new Error('Member not found');
    if (member.status === 'pending' && accessState === 'cancelled') {
        throw new Error('A pending application cannot be cancelled');
    }

    const { data, error } = await supabase
        .from('members')
        .update({ access_state: accessState })
        .eq('id', memberId)
        .select()
        .single();
    if (error || !data) throw new Error(error?.message || 'Failed to update member access');

    const settings = await getSettings();
    return {
        ...data,
        status: computeStatus(
            data,
            settings.expiry_reminder_days ?? 7,
            settings.grace_period_days ?? 3,
        ),
    };
};

export const getAll = async (limit?: number, offset?: number) => {
    let query = supabase
        .from('members')
        .select('*, plans(name)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

    if (limit !== undefined) query = query.range(offset || 0, (offset || 0) + limit - 1);

    const [{ data, error }, settings] = await Promise.all([
        query,
        getSettings(),
    ]);

    if (error) throw new Error(error.message);

    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    return data.map((m: any) => ({
        ...m,
        gov_id_document_path: undefined,
        status: computeStatus(m, reminderDays, graceDays),
        plan_name: m.plans?.name ?? null,
        plans: undefined,
    }));
};

export const getById = async (memberId: string) => {
    const [{ data, error }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('*, plans(name, duration_days, price)')
            .eq('id', memberId)
            .single(),
        getSettings(),
    ]);

    if (error || !data) throw new Error('Member not found');

    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    let govIdDocumentUrl: string | null = null;
    if (data.gov_id_document_path) {
        const { data: signedDocument } = await supabase.storage
            .from('member-id-documents')
            .createSignedUrl(data.gov_id_document_path, 10 * 60);
        govIdDocumentUrl = signedDocument?.signedUrl ?? null;
    }

    return {
        ...data,
        gov_id_document_path: undefined,
        gov_id_document_url: govIdDocumentUrl,
        status: computeStatus(data, reminderDays, graceDays),
        plan_name: data.plans?.name ?? null,
        plans: undefined,
    };
};

type ExistingMemberInput = {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    gov_id_type?: string;
    gov_id_number?: string;
    plan_id: string;
    join_date: string;
    days_remaining: number;
    has_paid: boolean;
    payment_amount?: number;
    payment_method?: 'cash' | 'upi' | 'card' | 'online';
    payment_date?: string;
};

type PendingMemberActivationInput = Pick<
    ExistingMemberInput,
    'plan_id' | 'join_date' | 'has_paid' | 'payment_method' | 'payment_date'
>;

type RenewalInput = Pick<
    ExistingMemberInput,
    'plan_id' | 'has_paid' | 'payment_method' | 'payment_date'
>;

const addDays = (date: string, days: number): string => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};

export const create = async (body: ExistingMemberInput) => {
    const today = new Date().toISOString().slice(0, 10);
    if (body.join_date > today) throw new Error('Membership start date cannot be in the future');
    if (body.has_paid && body.payment_date && body.payment_date > today) {
        throw new Error('Payment date cannot be in the future');
    }

    const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('id, name, price')
        .eq('id', body.plan_id)
        .single();
    if (planError || !plan) throw new Error('Membership plan not found');

    const expiryDate = addDays(today, body.days_remaining);
    const memberPayload = {
        name: body.name,
        phone: body.phone,
        email: body.email || null,
        address: body.address || null,
        gov_id_type: body.gov_id_type || null,
        gov_id_number: body.gov_id_number || null,
        plan_id: body.plan_id,
        join_date: body.join_date,
        expiry_date: expiryDate,
        status: body.days_remaining > 0 ? 'active' : 'expiring_soon',
    };

    let createdMember: any;
    const steps: Array<{ execute: () => Promise<any>; rollback: (result: any) => Promise<void> }> = [
        {
            execute: async () => {
                const { data, error } = await supabase.from('members').insert(memberPayload).select().single();
                if (error || !data) throw new Error(error?.message || 'Failed to add member');
                createdMember = data;
                return data;
            },
            rollback: async (member) => {
                await supabase.from('members').delete().eq('id', member.id);
            },
        },
    ];

    if (body.has_paid) {
        steps.push({
            execute: async () => {
                const invoiceId = await generateInvoiceId();
                const { data, error } = await supabase.from('payments').insert({
                    member_id: createdMember.id,
                    plan_id: plan.id,
                    amount: plan.price,
                    mode: body.payment_method === 'online' ? 'online' : 'offline',
                    method: body.payment_method,
                    status: 'completed',
                    date: body.payment_date,
                    invoice_id: invoiceId,
                }).select().single();
                if (error || !data) throw new Error(error?.message || 'Failed to record payment');
                return data;
            },
            rollback: async (payment) => {
                await supabase.from('payments').delete().eq('id', payment.id);
            },
        });
    }

    const results = await runSteps(steps);
    return { ...results[0], payment_recorded: body.has_paid, plan_name: plan.name };
};

export const activatePendingMember = async (memberId: string, body: PendingMemberActivationInput) => {
    const today = new Date().toISOString().slice(0, 10);
    if (body.join_date > today) throw new Error('Membership start date cannot be in the future');
    if (body.has_paid && body.payment_date && body.payment_date > today) {
        throw new Error('Payment date cannot be in the future');
    }

    const [{ data: member, error: memberError }, { data: plan, error: planError }] = await Promise.all([
        supabase.from('members').select('id, status, access_state, plan_id, join_date, expiry_date').eq('id', memberId).single(),
        supabase.from('plans').select('id, name, duration_days, price').eq('id', body.plan_id).eq('is_active', true).single(),
    ]);
    if (memberError || !member) throw new Error('Member application not found');
    if (member.status !== 'pending') throw new Error('Only pending applications can be added');
    if (member.access_state === 'blocked') throw new Error('Blocked applications cannot be added');
    if (planError || !plan) throw new Error('Active membership plan not found');

    const expiryDate = addDays(body.join_date, plan.duration_days);
    const paidStatus = expiryDate >= today ? 'active' : 'expired';
    const activationStatus = body.has_paid ? paidStatus : 'approved';
    const previous = {
        plan_id: member.plan_id,
        join_date: member.join_date,
        expiry_date: member.expiry_date,
        status: member.status,
    };
    let paymentId: string | null = null;

    await runSteps([
        {
            execute: async () => {
                const { data, error } = await supabase.from('members').update({
                    plan_id: body.plan_id,
                    join_date: body.join_date,
                    expiry_date: expiryDate,
                    status: activationStatus,
                }).eq('id', memberId).eq('status', 'pending').select().single();
                if (error || !data) throw new Error(error?.message || 'Failed to activate member');
                return data;
            },
            rollback: async () => {
                await supabase.from('members').update(previous).eq('id', memberId);
            },
        },
        ...(body.has_paid ? [{
            execute: async () => {
                const invoiceId = await generateInvoiceId();
                const { data, error } = await supabase.from('payments').insert({
                    member_id: memberId,
                    plan_id: body.plan_id,
                    amount: plan.price,
                    mode: body.payment_method === 'online' ? 'online' : 'offline',
                    method: body.payment_method,
                    status: 'completed',
                    date: body.payment_date,
                    invoice_id: invoiceId,
                }).select().single();
                if (error || !data) throw new Error(error?.message || 'Failed to record payment');
                paymentId = data.id;
                return data;
            },
            rollback: async (payment: any) => {
                await supabase.from('payments').delete().eq('id', payment.id);
            },
        }] : []),
    ]);

    return {
        id: memberId,
        status: activationStatus,
        plan_id: plan.id,
        plan_name: plan.name,
        join_date: body.join_date,
        expiry_date: expiryDate,
        payment_recorded: Boolean(paymentId),
    };
};

export const renewMember = async (memberId: string, body: RenewalInput) => {
    const today = new Date().toISOString().slice(0, 10);
    if (body.has_paid && body.payment_date && body.payment_date > today) {
        throw new Error('Payment date cannot be in the future');
    }

    const [{ data: member, error: memberError }, { data: plan, error: planError }] = await Promise.all([
        supabase
            .from('members')
            .select('id, status, access_state, plan_id, join_date, expiry_date')
            .eq('id', memberId)
            .single(),
        supabase
            .from('plans')
            .select('id, name, duration_days, price')
            .eq('id', body.plan_id)
            .eq('is_active', true)
            .single(),
    ]);

    if (memberError || !member) throw new Error('Member not found');
    if (member.status === 'pending' || member.access_state === 'blocked') {
        throw new Error('Pending or blocked members cannot be renewed');
    }
    if (planError || !plan) throw new Error('Active membership plan not found');

    const renewalStart = member.expiry_date && member.expiry_date > today
        ? member.expiry_date
        : today;
    const renewalExpiry = addDays(renewalStart, plan.duration_days);
    const renewalStatus = body.has_paid ? 'active' : 'approved';
    const previous = {
        plan_id: member.plan_id,
        join_date: member.join_date,
        expiry_date: member.expiry_date,
        status: member.status,
    };

    await runSteps([
        {
            execute: async () => {
                const { data, error } = await supabase.from('members').update({
                    plan_id: plan.id,
                    join_date: renewalStart,
                    expiry_date: renewalExpiry,
                    status: renewalStatus,
                }).eq('id', memberId).select().single();
                if (error || !data) throw new Error(error?.message || 'Failed to renew member');
                return data;
            },
            rollback: async () => {
                await supabase.from('members').update(previous).eq('id', memberId);
            },
        },
        ...(body.has_paid ? [{
            execute: async () => {
                const invoiceId = await generateInvoiceId();
                const { data, error } = await supabase.from('payments').insert({
                    member_id: memberId,
                    plan_id: plan.id,
                    amount: plan.price,
                    mode: body.payment_method === 'online' ? 'online' : 'offline',
                    method: body.payment_method,
                    status: 'completed',
                    date: body.payment_date,
                    invoice_id: invoiceId,
                }).select().single();
                if (error || !data) throw new Error(error?.message || 'Failed to record renewal payment');
                return data;
            },
            rollback: async (payment: any) => {
                await supabase.from('payments').delete().eq('id', payment.id);
            },
        }] : []),
    ]);

    return {
        id: memberId,
        status: renewalStatus,
        plan_id: plan.id,
        plan_name: plan.name,
        join_date: renewalStart,
        expiry_date: renewalExpiry,
        payment_recorded: body.has_paid,
    };
};

export const update = async (memberId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('members')
        .update(body)
        .eq('id', memberId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getStats = async () => memberStatsCache.get(async () => {
    const [{ data, error }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('status, access_state, expiry_date'),
        getSettings(),
    ]);

    if (error) throw new Error(error.message);

    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    const stats = { total: data.length, active: 0, expired: 0, expiring_soon: 0, blocked: 0, cancelled: 0, pending: 0 };
    for (const m of data) {
        const status = computeStatus(m, reminderDays, graceDays);
        if (status === 'active') stats.active++;
        else if (status === 'expired') stats.expired++;
        else if (status === 'expiring_soon') stats.expiring_soon++;
        else if (status === 'blocked') stats.blocked++;
        else if (status === 'cancelled') stats.cancelled++;
        else if (status === 'pending') stats.pending++;
    }
    return stats;
});
