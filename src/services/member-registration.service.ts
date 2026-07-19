import supabase from '../config/supabase';
import { generateInvoiceId, invalidatePaymentCaches } from './payment.service';
import { runSteps } from '../utils/transaction';
import { get as getSettings } from './settings.service';
import { randomUUID } from 'crypto';

const ID_DOCUMENT_BUCKET = 'member-id-documents';
const ALLOWED_ID_DOCUMENT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ID_DOCUMENT_SIZE = 5 * 1024 * 1024;

const documentExtension = (mimeType: string): string => {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    throw new Error('ID document must be a JPG, PNG, or WebP image');
};

export const getStatusByUserId = async (userId: string) => {
    const { data } = await supabase
        .from('members')
        .select('id, status, name, access_state')
        .eq('user_id', userId)
        .single();

    if (!data) return data;
    if (data.access_state === 'blocked') return { ...data, status: 'blocked' };
    if (data.access_state === 'cancelled') return { ...data, status: 'cancelled' };
    return data;
};

export const selfRegister = async (
    userId: string,
    email: string,
    body: Record<string, any>,
    document: { buffer: Buffer; mimetype: string; size: number },
) => {
    const settings = await getSettings();
    if (!settings.online_registration) throw new Error('Online registration is currently disabled');

    const existing = await getStatusByUserId(userId);
    if (existing) throw new Error('Already registered');

    if (!email) throw new Error('Your authenticated account does not have an email address');
    if (!ALLOWED_ID_DOCUMENT_MIME.has(document.mimetype)) {
        throw new Error('ID document must be a JPG, PNG, or WebP image');
    }
    if (document.size > MAX_ID_DOCUMENT_SIZE) throw new Error('ID document must be 5 MB or smaller');

    const documentPath = `${userId}/${randomUUID()}.${documentExtension(document.mimetype)}`;
    const { error: uploadError } = await supabase.storage
        .from(ID_DOCUMENT_BUCKET)
        .upload(documentPath, document.buffer, {
            contentType: document.mimetype,
            upsert: false,
        });
    if (uploadError) throw new Error(`Unable to store ID document: ${uploadError.message}`);

    const { data, error } = await supabase
        .from('members')
        .insert({
            ...body,
            email: email.trim().toLowerCase(),
            gov_id_document_path: documentPath,
            user_id: userId,
            status: 'pending',
        })
        .select()
        .single();

    if (error) {
        await supabase.storage.from(ID_DOCUMENT_BUCKET).remove([documentPath]);
        throw new Error(error.message);
    }
    return data;
};

export const getActivePlansByUserId = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('plan_id, status')
        .eq('user_id', userId)
        .maybeSingle();

    let query = supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

    // During initial activation the owner-assigned plan remains authoritative.
    // Existing members may compare every active plan when renewing/switching.
    if (member?.status === 'approved' && member.plan_id) query = query.eq('id', member.plan_id);
    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data;
};

export const getPaymentRequestByUserId = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

    if (!member) return null;

    const { data, error } = await supabase
        .from('payments')
        .select('*, plans(name, duration_days)')
        .eq('member_id', member.id)
        .eq('status', 'pending')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
        ...data,
        plan_name: data.plans?.name ?? null,
        duration_days: data.plans?.duration_days ?? null,
        plans: undefined,
    };
};

export const requestPayment = async (
    userId: string,
    body: { plan_id: string; method: 'cash' | 'upi' },
) => {
    const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id, status, access_state, plan_id')
        .eq('user_id', userId)
        .single();

    if (memberError || !member) throw new Error('Member not found');
    const isInitialPayment = member.status === 'approved';
    const canRequestPayment = ['approved', 'active', 'expired', 'expiring_soon'].includes(member.status);
    if (!canRequestPayment) throw new Error('Your membership is not ready for a payment request');
    if (member.access_state === 'blocked' || member.access_state === 'cancelled') {
        throw new Error('This membership cannot request a payment');
    }
    if (isInitialPayment && member.plan_id && member.plan_id !== body.plan_id) {
        throw new Error('Choose the plan assigned by the gym owner');
    }

    const [{ data: plan, error: planError }, existingRequest] = await Promise.all([
        supabase
            .from('plans')
            .select('id, name, duration_days, price')
            .eq('id', body.plan_id)
            .eq('is_active', true)
            .single(),
        getPaymentRequestByUserId(userId),
    ]);

    if (planError || !plan) throw new Error('Active membership plan not found');
    if (existingRequest) return existingRequest;

    const invoiceId = await generateInvoiceId();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from('payments')
        .insert({
            member_id: member.id,
            plan_id: plan.id,
            amount: plan.price,
            mode: 'offline',
            method: body.method,
            status: 'pending',
            date: today,
            invoice_id: invoiceId,
        })
        .select()
        .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create payment request');
    invalidatePaymentCaches();
    return {
        ...data,
        plan_name: plan.name,
        duration_days: plan.duration_days,
    };
};

export const activateWithPayment = async (userId: string, body: { plan_id: string; method: string; amount: number }) => {
    const { data: member } = await supabase
        .from('members')
        .select('id, status, plan_id, join_date, expiry_date')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');
    if (member.status !== 'approved') throw new Error('Member not approved yet');
    if (member.plan_id && member.plan_id !== body.plan_id) throw new Error('Pay for the plan assigned by the gym owner');

    const { data: plan } = await supabase
        .from('plans')
        .select('*')
        .eq('id', body.plan_id)
        .single();

    if (!plan) throw new Error('Plan not found');

    const today = new Date().toISOString().split('T')[0];
    const joinDate = member.join_date || today;
    const expiry = new Date(`${joinDate}T00:00:00.000Z`);
    expiry.setUTCDate(expiry.getUTCDate() + plan.duration_days);
    const expiryDate = member.expiry_date || expiry.toISOString().split('T')[0];
    const nextStatus = expiryDate >= today ? 'active' : 'expired';

    const previousStatus = member.status;

    await runSteps([
        {
            execute: async () => {
                const { error } = await supabase
                    .from('members')
                    .update({
                        plan_id: body.plan_id,
                        status: nextStatus,
                        join_date: joinDate,
                        expiry_date: expiryDate,
                    })
                    .eq('id', member.id);
                if (error) throw new Error(error.message);
            },
            rollback: async () => {
                await supabase
                    .from('members')
                    .update({ plan_id: member.plan_id, status: previousStatus, join_date: member.join_date, expiry_date: member.expiry_date })
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
                        amount: plan.price,
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

    return { status: nextStatus, expiry_date: expiryDate };
};
