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
// Only inserts if the user doesn't exist yet — never overwrites existing role/gym_id
export const syncUser = async (id: string, email: string, name?: string) => {
    // Check if user already exists
    const { data: existing } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('id', id)
        .single();

    if (existing) return existing; // Already synced — don't overwrite

    const { data, error } = await supabase
        .from('users')
        .insert({ id, email, name: name ?? '', role: 'member' })
        .select('id, email, role')
        .single();

    if (error) throw new Error('Failed to sync user');
    return data;
};

export const getAccountStatusByEmail = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        throw new Error('Email is required');
    }

    const { data, error } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
    });

    if (error) throw new Error('Failed to inspect account status');

    const authUser = (data?.users ?? []).find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (!authUser) {
        return {
            exists: false,
            role: null,
            can_setup_password_via_google: false,
        };
    }

    const providers = new Set<string>();
    const identities = Array.isArray((authUser as any).identities) ? (authUser as any).identities : [];

    for (const identity of identities) {
        if (typeof identity?.provider === 'string') providers.add(identity.provider);
        if (typeof identity?.identity_data?.provider === 'string') providers.add(identity.identity_data.provider);
    }

    if (typeof authUser.app_metadata?.provider === 'string') {
        providers.add(authUser.app_metadata.provider);
    }

    const hasGoogleIdentity = providers.has('google');
    const hasPasswordIdentity = providers.has('email');

    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();

    const role = profile?.role ?? 'member';

    return {
        exists: true,
        role,
        can_setup_password_via_google: role === 'member' && hasGoogleIdentity && !hasPasswordIdentity,
    };
};
