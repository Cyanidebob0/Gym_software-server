import supabase from '../config/supabase';
import { get as getSettings } from './settings.service';
import { generateInvoiceId, invalidatePaymentCaches } from './payment.service';
import { createAsyncCache } from '../utils/async-cache';
import { financialMutation } from '../utils/idempotency';

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

type PendingMemberActivationInput = {
    plan_id: string;
    join_date: string;
    has_paid: boolean;
    payment_method?: 'cash' | 'upi' | 'card' | 'online';
    payment_date?: string;
};

type RenewalInput = {
    plan_id: string;
    has_paid: boolean;
    payment_method?: 'cash' | 'upi' | 'card' | 'online';
    payment_date?: string;
};

export const activatePendingMember = async (
    memberId: string,
    body: PendingMemberActivationInput,
    idempotencyKey?: string,
) => {
    const today = new Date().toISOString().slice(0, 10);
    if (body.join_date > today) throw new Error('Membership start date cannot be in the future');
    if (body.has_paid && body.payment_date && body.payment_date > today) {
        throw new Error('Payment date cannot be in the future');
    }
    const invoiceId = body.has_paid ? await generateInvoiceId() : null;
    const mutation = financialMutation(
        'activate_member',
        { memberId, ...body },
        idempotencyKey,
    );
    const { data, error } = await supabase.rpc('financial_activate_member', {
        p_member_id: memberId,
        p_plan_id: body.plan_id,
        p_join_date: body.join_date,
        p_has_paid: body.has_paid,
        p_payment_method: body.payment_method ?? null,
        p_payment_date: body.payment_date ?? null,
        p_invoice_id: invoiceId,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to activate member');
    memberStatsCache.invalidate();
    if (body.has_paid) invalidatePaymentCaches();
    return data;
};

export const renewMember = async (
    memberId: string,
    body: RenewalInput,
    idempotencyKey?: string,
) => {
    const today = new Date().toISOString().slice(0, 10);
    if (body.has_paid && body.payment_date && body.payment_date > today) {
        throw new Error('Payment date cannot be in the future');
    }
    const invoiceId = body.has_paid ? await generateInvoiceId() : null;
    const mutation = financialMutation('renew_member', { memberId, ...body }, idempotencyKey);
    const { data, error } = await supabase.rpc('financial_renew_member', {
        p_member_id: memberId,
        p_plan_id: body.plan_id,
        p_has_paid: body.has_paid,
        p_payment_method: body.payment_method ?? null,
        p_payment_date: body.payment_date ?? null,
        p_invoice_id: invoiceId,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to renew member');
    memberStatsCache.invalidate();
    if (body.has_paid) invalidatePaymentCaches();
    return data;
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

// member_status_stats mirrors computeStatus above; p_today uses the local
// calendar date because computeStatus compares against local midnight.
export const getStats = async () => memberStatsCache.get(async () => {
    const settings = await getSettings();
    const now = new Date();
    const localToday = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');

    const { data, error } = await supabase.rpc('member_status_stats', {
        p_today: localToday,
        p_reminder_days: settings.expiry_reminder_days ?? 7,
        p_grace_days: settings.grace_period_days ?? 3,
    });
    if (error) throw new Error(error.message);

    return {
        total: Number(data?.total) || 0,
        active: Number(data?.active) || 0,
        expired: Number(data?.expired) || 0,
        expiring_soon: Number(data?.expiring_soon) || 0,
        blocked: Number(data?.blocked) || 0,
        cancelled: Number(data?.cancelled) || 0,
        pending: Number(data?.pending) || 0,
    };
});
