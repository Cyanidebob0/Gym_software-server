import supabase from '../config/supabase';
import { isOwnerEmail } from '../config/whitelist';
import { UserRole } from '../types';

export const getMe = async (userId: string) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, role, created_at')
        .eq('id', userId)
        .single();

    if (error || !data) throw new Error('User not found');
    return data;
};

// Privileged access is controlled only by the server-side whitelists. There
// is one Sweat Zone installation, so roles no longer imply gym ownership.
const resolveRole = (email: string): UserRole =>
    isOwnerEmail(email) ? 'owner' : 'member';

export const syncUser = async (
    id: string,
    email: string,
    name?: string,
): Promise<{ user: Record<string, unknown>; changed: boolean }> => {
    const role = resolveRole(email);

    const { data: existing } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('id', id)
        .single();

    if (existing) {
        // Reconcile in both directions so removing an email from a privileged
        // whitelist immediately demotes it on the next sync.
        if (role !== existing.role) {
            const { data: updated, error } = await supabase
                .from('users')
                .update({ role })
                .eq('id', id)
                .select('id, email, role')
                .single();
            if (error) throw new Error('Failed to update user role');
            return { user: updated, changed: true };
        }
        return { user: existing, changed: false };
    }

    const { data, error } = await supabase
        .from('users')
        .insert({ id, email, name: name ?? '', role })
        .select('id, email, role')
        .single();

    if (error) throw new Error('Failed to sync user');
    return { user: data, changed: true };
};

// Link a password only to the currently authenticated Google account.
export const linkPassword = async (userId: string, password: string): Promise<void> => {
    const { data, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !data.user) throw new Error('Authenticated account not found');

    const hasGoogleIdentity = data.user.identities?.some(
        (identity) => identity.provider === 'google',
    );
    if (!hasGoogleIdentity) {
        throw new Error('Sign in with Google before linking a password');
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error('Failed to link password');
};
