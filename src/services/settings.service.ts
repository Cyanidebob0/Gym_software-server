import supabase from '../config/supabase';
import { createAsyncCache } from '../utils/async-cache';

const DEFAULT_SETTINGS = {
    gym_name: 'Sweat Zone',
    gym_address: '',
    gym_phone: '',
    expiry_reminder_days: 7,
    sms_reminders: false,
    online_registration: true,
    refunds_enabled: true,
    grace_period_days: 3,
};

const settingsCache = createAsyncCache<Record<string, any>>(60_000);

// Settings is a singleton table for the one Sweat Zone installation.
export const get = async () => settingsCache.get(async () => {
    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data ?? DEFAULT_SETTINGS;
});

export const upsert = async (body: Record<string, any>) => {
    const { data: existing, error: readError } = await supabase
        .from('settings')
        .select('id')
        .limit(1)
        .maybeSingle();

    if (readError) throw new Error(readError.message);

    const payload = { ...body, gym_name: 'Sweat Zone' };
    const query = existing
        ? supabase.from('settings').update(payload).eq('id', existing.id)
        : supabase.from('settings').insert(payload);

    const { data, error } = await query.select().single();
    if (error) throw new Error(error.message);
    settingsCache.invalidate();
    return data;
};
