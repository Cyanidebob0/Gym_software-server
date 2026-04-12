import supabase from '../config/supabase';

export const get = async (gymId: string) => {
    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('gym_id', gymId)
        .single();

    // If no settings exist yet, return defaults
    if (error || !data) {
        return {
            gym_id: gymId,
            gym_name: '',
            gym_address: '',
            gym_phone: '',
            expiry_reminder_days: 7,
            sms_reminders: false,
            online_registration: true,
            refunds_enabled: true,
            grace_period_days: 3,
        };
    }
    return data;
};

export const upsert = async (gymId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('settings')
        .upsert({ ...body, gym_id: gymId }, { onConflict: 'gym_id' })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};
