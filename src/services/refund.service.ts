import supabase from '../config/supabase';
import { get as getSettings } from './settings.service';

const requireRefundsEnabled = async () => {
    const settings = await getSettings();
    if (!settings.refunds_enabled) throw new Error('Refunds are currently disabled');
};

const money = (value: unknown) => Number(value) || 0;

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

export const create = async (body: Record<string, any>) => {
    await requireRefundsEnabled();

    const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select('id, member_id, amount, status')
        .eq('id', body.payment_id)
        .single();

    if (paymentError || !payment) throw new Error('Payment not found');
    if (payment.status !== 'completed') throw new Error('Only completed payments can be refunded');

    const { data: existingRefunds, error: refundsError } = await supabase
        .from('refunds')
        .select('amount, status')
        .eq('payment_id', payment.id)
        .in('status', ['pending', 'approved']);

    if (refundsError) throw new Error(refundsError.message);

    const reservedAmount = (existingRefunds ?? []).reduce(
        (total: number, refund: any) => total + money(refund.amount),
        0,
    );
    const refundableBalance = money(payment.amount) - reservedAmount;
    const requestedAmount = money(body.amount);

    if (refundableBalance <= 0) throw new Error('This payment has no refundable balance');
    if (requestedAmount > refundableBalance) {
        throw new Error(`Refund amount cannot exceed the refundable balance of ${refundableBalance}`);
    }

    const { data, error } = await supabase
        .from('refunds')
        .insert({
            member_id: payment.member_id,
            payment_id: body.payment_id,
            amount: requestedAmount,
            reason: body.reason,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const updateStatus = async (refundId: string, status: 'approved' | 'rejected') => {
    await requireRefundsEnabled();

    const { data: refund, error: refundError } = await supabase
        .from('refunds')
        .select('id, payment_id, amount, status')
        .eq('id', refundId)
        .single();

    if (refundError || !refund) throw new Error('Refund not found');
    if (refund.status !== 'pending') throw new Error('Only pending refunds can be resolved');

    const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select('id, amount')
        .eq('id', refund.payment_id)
        .single();

    if (paymentError || !payment) throw new Error('Payment not found');

    if (status === 'approved') {
        const { data: approvedRefunds, error: approvedError } = await supabase
            .from('refunds')
            .select('amount')
            .eq('payment_id', refund.payment_id)
            .eq('status', 'approved');

        if (approvedError) throw new Error(approvedError.message);
        const alreadyRefunded = (approvedRefunds ?? []).reduce(
            (total: number, item: any) => total + money(item.amount),
            0,
        );
        if (alreadyRefunded + money(refund.amount) > money(payment.amount)) {
            throw new Error('Approving this refund would exceed the payment amount');
        }
    }

    const { data, error } = await supabase
        .from('refunds')
        .update({ status, resolved_date: new Date().toISOString().split('T')[0] })
        .eq('id', refundId)
        .eq('status', 'pending')
        .select()
        .single();

    if (error || !data) throw new Error(error?.message ?? 'Refund is no longer pending');

    if (status === 'approved') {
        const { data: approvedRefunds, error: approvedError } = await supabase
            .from('refunds')
            .select('amount')
            .eq('payment_id', refund.payment_id)
            .eq('status', 'approved');

        if (approvedError) throw new Error(approvedError.message);
        const approvedTotal = (approvedRefunds ?? []).reduce(
            (total: number, item: any) => total + money(item.amount),
            0,
        );

        if (approvedTotal >= money(payment.amount)) {
            const { error: paymentUpdateError } = await supabase
                .from('payments')
                .update({ status: 'refunded' })
                .eq('id', refund.payment_id);
            if (paymentUpdateError) {
                await supabase
                    .from('refunds')
                    .update({ status: 'pending', resolved_date: null })
                    .eq('id', refundId);
                throw new Error(paymentUpdateError.message);
            }
        }
    }

    return data;
};
