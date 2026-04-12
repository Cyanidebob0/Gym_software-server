import supabase from '../config/supabase';
import { generateInvoiceId } from './payment.service';
import { get as getSettings } from './settings.service';

// Compute effective status based on expiry_date + gym settings
const computeStatus = (
    member: any,
    reminderDays: number,
    graceDays: number,
): string => {
    // Only re-compute for members with an expiry_date and an active/expiring/expired status
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
    if (daysUntilExpiry >= -graceDays) return 'expiring_soon'; // within grace period
    return 'expired';
};

export const getAll = async (gymId: string) => {
    const [{ data, error }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('*, plans(name)')
            .eq('gym_id', gymId)
            .order('created_at', { ascending: false }),
        getSettings(gymId),
    ]);

    if (error) throw new Error(error.message);

    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    return data.map((m: any) => ({
        ...m,
        status: computeStatus(m, reminderDays, graceDays),
        plan_name: m.plans?.name ?? null,
        plans: undefined,
    }));
};

export const getById = async (gymId: string, memberId: string) => {
    const [{ data, error }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('*, plans(name, duration_days, price)')
            .eq('id', memberId)
            .eq('gym_id', gymId)
            .single(),
        getSettings(gymId),
    ]);

    if (error || !data) throw new Error('Member not found');

    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    return {
        ...data,
        status: computeStatus(data, reminderDays, graceDays),
        plan_name: data.plans?.name ?? null,
        plans: undefined,
    };
};

export const create = async (gymId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('members')
        .insert({ ...body, gym_id: gymId })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const update = async (gymId: string, memberId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('members')
        .update(body)
        .eq('id', memberId)
        .eq('gym_id', gymId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getStats = async (gymId: string) => {
    const [{ data, error }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('status, expiry_date')
            .eq('gym_id', gymId),
        getSettings(gymId),
    ]);

    if (error) throw new Error(error.message);

    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    const stats = { total: data.length, active: 0, expired: 0, expiring_soon: 0, blocked: 0, pending: 0 };
    for (const m of data) {
        const status = computeStatus(m, reminderDays, graceDays);
        if (status === 'active') stats.active++;
        else if (status === 'expired') stats.expired++;
        else if (status === 'expiring_soon') stats.expiring_soon++;
        else if (status === 'blocked') stats.blocked++;
        else if (status === 'pending') stats.pending++;
    }
    return stats;
};

// Member self-service: get profile by user_id
export const getProfileByUserId = async (userId: string) => {
    const { data, error } = await supabase
        .from('members')
        .select('*, plans(name, duration_days, price)')
        .eq('user_id', userId)
        .single();

    if (error || !data) throw new Error('Member profile not found');

    // Fetch settings for the member's gym to compute status
    const settings = await getSettings(data.gym_id);
    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    return {
        ...data,
        status: computeStatus(data, reminderDays, graceDays),
        plan_name: data.plans?.name ?? null,
        plans: undefined,
    };
};

// Member self-service: get attendance by user_id
export const getAttendanceByUserId = async (userId: string) => {
    // First get member id
    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');

    const { data, error } = await supabase
        .from('attendance')
        .select('date, check_in, check_out')
        .eq('member_id', member.id)
        .order('date', { ascending: false })
        .order('check_in', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

// Member self-service: get payments by user_id
export const getPaymentsByUserId = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');

    const { data, error } = await supabase
        .from('payments')
        .select('*, plans(name)')
        .eq('member_id', member.id)
        .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return data.map((p: any) => ({ ...p, plan_name: p.plans?.name ?? null, plans: undefined }));
};

// Member self-registration: get status by user_id (returns null if no record)
export const getStatusByUserId = async (userId: string) => {
    const { data } = await supabase
        .from('members')
        .select('id, status, name')
        .eq('user_id', userId)
        .single();

    return data; // null if not found
};

// Member self-registration: create pending member
export const selfRegister = async (userId: string, body: Record<string, any>) => {
    // Find the single gym
    const { data: gyms, error: gymError } = await supabase
        .from('gyms')
        .select('id')
        .limit(1);

    if (gymError || !gyms?.length) throw new Error('No gym found');
    const gymId = gyms[0].id;

    // Check if already registered
    const existing = await getStatusByUserId(userId);
    if (existing) throw new Error('Already registered');

    // Create member with pending status
    const { data, error } = await supabase
        .from('members')
        .insert({ ...body, gym_id: gymId, user_id: userId, status: 'pending' })
        .select()
        .single();

    if (error) throw new Error(error.message);

    // Set user's gym_id
    await supabase
        .from('users')
        .update({ gym_id: gymId })
        .eq('id', userId);

    return data;
};

// Member self-registration: get active plans for member's gym
export const getActivePlansByUserId = async (userId: string) => {
    const { data: user } = await supabase
        .from('users')
        .select('gym_id')
        .eq('id', userId)
        .single();

    if (!user?.gym_id) throw new Error('No gym associated');

    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('gym_id', user.gym_id)
        .eq('is_active', true)
        .order('price', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
};

// Member self-registration: activate with payment
export const activateWithPayment = async (userId: string, body: { plan_id: string; method: string; amount: number }) => {
    // Get member record
    const { data: member } = await supabase
        .from('members')
        .select('id, gym_id, status')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');
    if (member.status !== 'approved') throw new Error('Member not approved yet');

    // Get plan details
    const { data: plan } = await supabase
        .from('plans')
        .select('*')
        .eq('id', body.plan_id)
        .eq('gym_id', member.gym_id)
        .single();

    if (!plan) throw new Error('Plan not found');

    const today = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.duration_days);
    const expiryDate = expiry.toISOString().split('T')[0];

    // Update member: set plan, status active, dates
    const { error: updateError } = await supabase
        .from('members')
        .update({
            plan_id: body.plan_id,
            status: 'active',
            join_date: today,
            expiry_date: expiryDate,
        })
        .eq('id', member.id);

    if (updateError) throw new Error(updateError.message);

    // Create payment record
    const invoice_id = await generateInvoiceId(member.gym_id);
    const { error: paymentError } = await supabase
        .from('payments')
        .insert({
            gym_id: member.gym_id,
            member_id: member.id,
            plan_id: body.plan_id,
            amount: body.amount,
            method: body.method,
            mode: 'offline',
            status: 'completed',
            date: today,
            invoice_id,
        });

    if (paymentError) throw new Error(paymentError.message);

    return { status: 'active', expiry_date: expiryDate };
};

// Member self-service: update own profile (limited fields)
export const updateProfileByUserId = async (userId: string, body: { phone?: string; address?: string; gender?: string }) => {
    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');

    const allowed: Record<string, any> = {};
    if (body.phone !== undefined) allowed.phone = body.phone;
    if (body.address !== undefined) allowed.address = body.address;
    if (body.gender !== undefined) allowed.gender = body.gender;

    if (Object.keys(allowed).length === 0) throw new Error('No fields to update');

    const { data, error } = await supabase
        .from('members')
        .update(allowed)
        .eq('id', member.id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

// Member self-service: check-in (returns the attendance record or existing open one)
export const selfCheckIn = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('id, gym_id, status')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');
    if (!['active', 'expiring_soon'].includes(member.status)) throw new Error('Membership not active');

    const today = new Date().toISOString().split('T')[0];
    const checkIn = new Date().toTimeString().slice(0, 5);

    // Check if already checked in today without checkout
    const { data: existing } = await supabase
        .from('attendance')
        .select('id, check_in, check_out')
        .eq('member_id', member.id)
        .eq('date', today)
        .is('check_out', null)
        .limit(1);

    if (existing && existing.length > 0) {
        return { already_checked_in: true, attendance: existing[0] };
    }

    const { data, error } = await supabase
        .from('attendance')
        .insert({ gym_id: member.gym_id, member_id: member.id, check_in: checkIn, date: today })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return { already_checked_in: false, attendance: data };
};

// Member self-service: check-out (closes the open attendance record for today)
export const selfCheckOut = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');

    const today = new Date().toISOString().split('T')[0];
    const checkOut = new Date().toTimeString().slice(0, 5);

    // Find open attendance record for today
    const { data: open } = await supabase
        .from('attendance')
        .select('id')
        .eq('member_id', member.id)
        .eq('date', today)
        .is('check_out', null)
        .limit(1);

    if (!open || open.length === 0) throw new Error('No open check-in found for today');

    const { data, error } = await supabase
        .from('attendance')
        .update({ check_out: checkOut })
        .eq('id', open[0].id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

// Member self-service: get today's check-in status
export const getTodayCheckIn = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (!member) return null;

    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
        .from('attendance')
        .select('id, check_in, check_out')
        .eq('member_id', member.id)
        .eq('date', today)
        .order('check_in', { ascending: false })
        .limit(1);

    if (!data || data.length === 0) return null;
    return data[0];
};

// Member self-service: get broadcasts for member's gym
export const getBroadcastsByUserId = async (userId: string) => {
    const { data: user } = await supabase
        .from('users')
        .select('gym_id')
        .eq('id', userId)
        .single();

    if (!user?.gym_id) throw new Error('No gym associated');

    const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('gym_id', user.gym_id)
        .order('sent_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};
