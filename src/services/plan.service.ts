import supabase from '../config/supabase';

export const getAll = async () => {
    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('price', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
};

export const getActive = async () => {
    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
};

export const getById = async (planId: string) => {
    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single();

    if (error || !data) throw new Error('Plan not found');
    return data;
};

export const create = async (body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('plans')
        .insert(body)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const update = async (planId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('plans')
        .update(body)
        .eq('id', planId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const toggle = async (planId: string) => {
    const plan = await getById(planId);
    const { data, error } = await supabase
        .from('plans')
        .update({
            is_active: !plan.is_active,
            ...(!plan.is_active ? {} : { is_recommended: false }),
        })
        .eq('id', planId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const recommend = async (planId: string) => {
    const { data, error } = await supabase.rpc('set_recommended_plan', {
        target_plan_id: planId,
    });

    if (error) throw new Error(error.message);
    return data;
};
