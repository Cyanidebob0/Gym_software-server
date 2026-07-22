import supabase from '../config/supabase';
import { financialMutation } from '../utils/idempotency';

export const getAll = async (limit?: number, offset?: number) => {
    let query = supabase
        .from('refunds')
        .select('*, members(name), payments(invoice_id)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

    if (limit !== undefined) query = query.range(offset || 0, (offset || 0) + limit - 1);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data.map((r: any) => ({
        ...r,
        member_name: r.members?.name ?? null,
        invoice_id: r.payments?.invoice_id ?? null,
        members: undefined,
        payments: undefined,
    }));
};

export const create = async (body: Record<string, any>, idempotencyKey?: string) => {
    const payload = { paymentId: body.payment_id, amount: body.amount, reason: body.reason };
    const mutation = financialMutation('create_refund', payload, idempotencyKey);
    const { data, error } = await supabase.rpc('financial_create_refund', {
        p_payment_id: body.payment_id,
        p_amount: body.amount,
        p_reason: body.reason,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error || !data) throw new Error(error?.message ?? 'Failed to create refund');
    return data;
};

export const updateStatus = async (
    refundId: string,
    status: 'approved' | 'rejected',
    idempotencyKey?: string,
) => {
    const mutation = financialMutation('resolve_refund', { refundId, status }, idempotencyKey);
    const { data, error } = await supabase.rpc('financial_resolve_refund', {
        p_refund_id: refundId,
        p_status: status,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error || !data) throw new Error(error?.message ?? 'Failed to resolve refund');
    return data;
};
