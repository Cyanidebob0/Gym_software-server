import supabase from '../config/supabase';

export const getAll = async (limit?: number, offset?: number) => {
    let query = supabase
        .from('broadcasts')
        .select('*')
        .order('sent_at', { ascending: false });

    if (limit !== undefined) query = query.range(offset || 0, (offset || 0) + limit - 1);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data;
};

export const send = async (userId: string, body: Record<string, any>) => {
    const { data, error } = await supabase
        .from('broadcasts')
        .insert({
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

export const update = async (broadcastId: string, body: Record<string, any>) => {
    const allowed: Record<string, any> = {};
    if (body.title !== undefined) allowed.title = body.title;
    if (body.message !== undefined) allowed.message = body.message;
    if (body.target !== undefined) allowed.target = body.target;
    if (body.priority !== undefined) allowed.priority = body.priority;

    const { data, error } = await supabase
        .from('broadcasts')
        .update(allowed)
        .eq('id', broadcastId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const remove = async (broadcastId: string) => {
    const { error } = await supabase
        .from('broadcasts')
        .delete()
        .eq('id', broadcastId);

    if (error) throw new Error(error.message);
};
