import supabase from '../config/supabase';
import { get as getSettings } from './settings.service';
import { computeStatus } from './member-management.service';
import { getMemberIdByUserId, rememberMemberId } from './member-identity-cache';

export const getMemberDashboardByUserId = async (userId: string) => {
    const [{ data: member, error: memberError }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('*, plans(name, duration_days, price)')
            .eq('user_id', userId)
            .maybeSingle(),
        getSettings(),
    ]);

    if (memberError) throw new Error(memberError.message);
    if (!member) {
        return { status: null, profile: null, attendance: [], today_check_in: null };
    }

    rememberMemberId(userId, member.id);
    const computedStatus = computeStatus(
        member,
        settings.expiry_reminder_days ?? 7,
        settings.grace_period_days ?? 3,
    );
    const status = {
        id: member.id,
        name: member.name,
        access_state: member.access_state,
        status: computedStatus,
    };

    if (!['active', 'expired', 'expiring_soon', 'cancelled'].includes(computedStatus)) {
        return { status, profile: null, attendance: [], today_check_in: null };
    }

    const { data: attendance, error: attendanceError } = await supabase
        .from('attendance')
        .select('date, check_in, check_out')
        .eq('member_id', member.id)
        .order('date', { ascending: false })
        .order('check_in', { ascending: false });
    if (attendanceError) throw new Error(attendanceError.message);

    const today = new Date().toISOString().slice(0, 10);
    const todayCheckIn = (attendance ?? []).find((record) => record.date === today) ?? null;
    const profile = {
        ...member,
        status: computedStatus,
        plan_name: member.plans?.name ?? null,
        plans: member.plans,
    };

    return {
        status,
        profile,
        attendance: attendance ?? [],
        today_check_in: todayCheckIn,
    };
};

export const getProfileByUserId = async (userId: string) => {
    const { data, error } = await supabase
        .from('members')
        .select('*, plans(name, duration_days, price)')
        .eq('user_id', userId)
        .single();

    if (error || !data) throw new Error('Member profile not found');

    const settings = await getSettings();
    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    return {
        ...data,
        status: computeStatus(data, reminderDays, graceDays),
        plan_name: data.plans?.name ?? null,
        plans: undefined,
    };
};

export const getAttendanceByUserId = async (userId: string) => {
    const memberId = await getMemberIdByUserId(userId);

    const { data, error } = await supabase
        .from('attendance')
        .select('date, check_in, check_out')
        .eq('member_id', memberId)
        .order('date', { ascending: false })
        .order('check_in', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

export const getPaymentsByUserId = async (userId: string) => {
    const memberId = await getMemberIdByUserId(userId);

    const { data, error } = await supabase
        .from('payments')
        .select('*, plans(name)')
        .eq('member_id', memberId)
        .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return data.map((p: any) => ({ ...p, plan_name: p.plans?.name ?? null, plans: undefined }));
};

export const updateProfileByUserId = async (userId: string, body: { name?: string; phone?: string; address?: string; gender?: string }) => {
    const memberId = await getMemberIdByUserId(userId);

    const allowed: Record<string, any> = {};
    if (body.name !== undefined) allowed.name = body.name;
    if (body.phone !== undefined) allowed.phone = body.phone;
    if (body.address !== undefined) allowed.address = body.address;
    if (body.gender !== undefined) allowed.gender = body.gender;

    if (Object.keys(allowed).length === 0) throw new Error('No fields to update');

    const { data, error } = await supabase
        .from('members')
        .update(allowed)
        .eq('id', memberId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const selfCheckIn = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('id, status')
        .eq('user_id', userId)
        .single();

    if (!member) throw new Error('Member not found');
    if (!['active', 'expiring_soon'].includes(member.status)) throw new Error('Membership not active');

    const today = new Date().toISOString().split('T')[0];
    const checkIn = new Date().toTimeString().slice(0, 5);

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
        .insert({ member_id: member.id, check_in: checkIn, date: today })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return { already_checked_in: false, attendance: data };
};

export const selfCheckOut = async (userId: string) => {
    const memberId = await getMemberIdByUserId(userId);

    const today = new Date().toISOString().split('T')[0];
    const checkOut = new Date().toTimeString().slice(0, 5);

    const { data: open } = await supabase
        .from('attendance')
        .select('id')
        .eq('member_id', memberId)
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

export const getTodayCheckIn = async (userId: string) => {
    let memberId: string;
    try {
        memberId = await getMemberIdByUserId(userId);
    } catch {
        return null;
    }

    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
        .from('attendance')
        .select('id, check_in, check_out')
        .eq('member_id', memberId)
        .eq('date', today)
        .order('check_in', { ascending: false })
        .limit(1);

    if (!data || data.length === 0) return null;
    return data[0];
};

export const getBroadcastsByUserId = async (userId: string) => {
    const { data: member } = await supabase
        .from('members')
        .select('id, status, expiry_date')
        .eq('user_id', userId)
        .maybeSingle();

    if (!member) throw new Error('Member not found');

    const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .order('sent_at', { ascending: false });

    if (error) throw new Error(error.message);
    const settings = await getSettings();
    const status = computeStatus(
        member,
        settings.expiry_reminder_days ?? 7,
        settings.grace_period_days ?? 3,
    );

    return data.filter((broadcast: any) => {
        if (!broadcast.target || broadcast.target === 'all') return true;
        if (broadcast.target === 'active') return status === 'active';
        if (broadcast.target === 'expiring') return status === 'expiring_soon';
        return false;
    });
};
