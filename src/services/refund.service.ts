import supabase from '../config/supabase';

export const getAll = async () => {
    const { data, error } = await supabase
        .from('refunds')
        .select('*, members(name), payments(invoice_id)')
        .order('created_at', { ascending: false });

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
    const { data, error } = await supabase
        .from('refunds')
        .insert({
            member_id: body.member_id,
            payment_id: body.payment_id,
            amount: body.amount,
            reason: body.reason,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const updateStatus = async (refundId: string, status: 'approved' | 'rejected') => {
    const updateData: Record<string, any> = { status };
    if (status === 'approved' || status === 'rejected') {
        updateData.resolved_date = new Date().toISOString().split('T')[0];
    }

    const { data, error } = await supabase
        .from('refunds')
        .update(updateData)
        .eq('id', refundId)
        .select()
        .single();

    if (error) throw new Error(error.message);

    // If approved, mark the payment as refunded
    if (status === 'approved') {
        const { data: refund } = await supabase
            .from('refunds')
            .select('payment_id')
            .eq('id', refundId)
            .single();

        if (refund) {
            await supabase
                .from('payments')
                .update({ status: 'refunded' })
                .eq('id', refund.payment_id);
        }
    }

    return data;
};
