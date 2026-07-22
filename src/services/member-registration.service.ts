import supabase from '../config/supabase';
import { generateInvoiceId, invalidatePaymentCaches } from './payment.service';
import { get as getSettings } from './settings.service';
import { randomUUID } from 'crypto';
import { financialMutation } from '../utils/idempotency';

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
        .order('is_recommended', { ascending: false })
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
    idempotencyKey?: string,
) => {
    const invoiceId = await generateInvoiceId();
    const mutation = financialMutation(
        'request_payment',
        { userId, planId: body.plan_id, method: body.method },
        idempotencyKey,
    );
    const { data, error } = await supabase.rpc('financial_request_payment', {
        p_user_id: userId,
        p_plan_id: body.plan_id,
        p_method: body.method,
        p_invoice_id: invoiceId,
        p_idempotency_key: mutation.idempotencyKey,
        p_request_hash: mutation.requestHash,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to create payment request');
    invalidatePaymentCaches();
    return data;
};
