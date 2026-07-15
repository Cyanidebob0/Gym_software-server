import supabase from '../config/supabase';
import { generateInvoiceId } from './payment.service';
import { runSteps } from '../utils/transaction';

export const getStatusByUserId = async (userId: string) => {
    const { data } = await supabase
        .from('members')
        .select('id, status, name')
        .eq('user_id', userId)
        .single();

    return data;
};

export const selfRegister = async (userId: string, body: Record<string, any>) => {
    const existing = await getStatusByUserId(userId);
    if (existing) throw new Error('Already registered');

    const { data, error } = await supabase
        .from('members')
        .insert({ ...body, user_id: userId, status: 'pending' })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getActivePlansByUserId = async (_userId: string) => {
    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
};

export const activateWithPayment = async (userId: string, body: { plan_id: string; method: string; amount: number }) => {
    const { data: member } = await supabase
        .from('members')
        .select('id, status')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');
    if (member.status !== 'approved') throw new Error('Member not approved yet');

    const { data: plan } = await supabase
        .from('plans')
        .select('*')
        .eq('id', body.plan_id)
        .single();

    if (!plan) throw new Error('Plan not found');

    const today = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.duration_days);
    const expiryDate = expiry.toISOString().split('T')[0];

    const previousStatus = member.status;

    await runSteps([
        {
            execute: async () => {
                const { error } = await supabase
                    .from('members')
                    .update({
                        plan_id: body.plan_id,
                        status: 'active',
                        join_date: today,
                        expiry_date: expiryDate,
                    })
                    .eq('id', member.id);
                if (error) throw new Error(error.message);
            },
            rollback: async () => {
                await supabase
                    .from('members')
                    .update({ plan_id: null, status: previousStatus, join_date: null, expiry_date: null })
                    .eq('id', member.id);
            },
        },
        {
            execute: async () => {
                const invoice_id = await generateInvoiceId();
                const { error } = await supabase
                    .from('payments')
                    .insert({
                        member_id: member.id,
                        plan_id: body.plan_id,
                        amount: body.amount,
                        method: body.method,
                        mode: 'offline',
                        status: 'completed',
                        date: today,
                        invoice_id,
                    });
                if (error) throw new Error(error.message);
            },
            rollback: async () => {
                await supabase
                    .from('payments')
                    .delete()
                    .eq('member_id', member.id)
                    .eq('date', today)
                    .eq('plan_id', body.plan_id);
            },
        },
    ]);

    return { status: 'active', expiry_date: expiryDate };
};
