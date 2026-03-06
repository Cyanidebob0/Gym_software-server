import supabase from '../config/supabase';

// All sign-in / sign-up / OAuth is handled by Supabase Auth on the frontend.
// The server only needs to expose a /me endpoint to return the user's profile.

export const getMe = async (userId: string) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, role, gym_id, created_at')
        .eq('id', userId)
        .single();

    if (error || !data) throw new Error('User not found');
    return data;
};

// Called by a webhook or post-signup trigger to sync Supabase Auth user → users table
export const syncUser = async (id: string, email: string, name?: string) => {
    const { data, error } = await supabase
        .from('users')
        .upsert({ id, email, name: name ?? '', role: 'member' }, { onConflict: 'id' })
        .select('id, email, role')
        .single();

    if (error) throw new Error('Failed to sync user');
    return data;
};
