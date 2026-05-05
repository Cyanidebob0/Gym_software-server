import supabase from '../config/supabase';
import { get as getSettings } from './settings.service';

const computeStatus = (
    member: any,
    reminderDays: number,
    graceDays: number,
): string => {
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

export const getAll = async (gymId: string, limit?: number, offset?: number) => {
    let query = supabase
        .from('members')
        .select('*, plans(name)')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false });

    if (limit !== undefined) query = query.range(offset || 0, (offset || 0) + limit - 1);

    const [{ data, error }, settings] = await Promise.all([
        query,
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
