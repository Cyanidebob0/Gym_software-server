import supabase from '../config/supabase';

export const getAll = async (gymId: string) => {
    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('gym_id', gymId)
        .order('price', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
};

export const getActive = async (gymId: string) => {
    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('gym_id', gymId)
        .eq('is_active', true)
        .order('price', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
};

export const getById = async (gymId: string, planId: string) => {
    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .eq('gym_id', gymId)
        .single();

    if (error || !data) throw new Error('Plan not found');
    return data;
};

export const create = async (gymId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('plans')
        .insert({ ...body, gym_id: gymId })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const update = async (gymId: string, planId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('plans')
        .update(body)
        .eq('id', planId)
        .eq('gym_id', gymId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const toggle = async (gymId: string, planId: string) => {
    const plan = await getById(gymId, planId);
    const { data, error } = await supabase
        .from('plans')
        .update({ is_active: !plan.is_active })
        .eq('id', planId)
        .eq('gym_id', gymId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};
