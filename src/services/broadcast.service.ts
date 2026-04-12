import supabase from '../config/supabase';

export const getAll = async (gymId: string) => {
    const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('gym_id', gymId)
        .order('sent_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

export const send = async (gymId: string, userId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('broadcasts')
        .insert({
            gym_id: gymId,
            sent_by: userId,
            title: body.title,
            message: body.message,
            target: body.target || 'all',
            priority: body.priority || 'normal',
            sent_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const update = async (gymId: string, broadcastId: string, body: Record<string, any>) => {
    const allowed: Record<string, any> = {};
    if (body.title !== undefined) allowed.title = body.title;
    if (body.message !== undefined) allowed.message = body.message;
    if (body.target !== undefined) allowed.target = body.target;
    if (body.priority !== undefined) allowed.priority = body.priority;

    const { data, error } = await supabase
        .from('broadcasts')
        .update(allowed)
        .eq('id', broadcastId)
        .eq('gym_id', gymId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const remove = async (gymId: string, broadcastId: string) => {
    const { error } = await supabase
        .from('broadcasts')
        .delete()
        .eq('id', broadcastId)
        .eq('gym_id', gymId);

    if (error) throw new Error(error.message);
};
