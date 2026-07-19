import supabase from '../config/supabase';
import { isOwnerEmail } from '../config/whitelist';
import { AuthMethod, UserRole } from '../types';

export const OWNER_PASSWORD_REQUIRED = 'Gym owners can only sign in with email and password';

const rejectOwnerNonPasswordAuth = async (
    id: string,
    email: string,
    authMethod: AuthMethod,
): Promise<void> => {
    if (!isOwnerEmail(email) || authMethod === 'password') return;

    const { data } = await supabase.auth.admin.getUserById(id);
    const providers = new Set((data.user?.identities ?? []).map((identity) => identity.provider));
    const isOAuthOnlyAccount = providers.has('google') && !providers.has('email');

    // Delete only an OAuth-only owner identity. If Google was linked to an
    // existing password owner, preserve the valid account and reject this session.
    if (isOAuthOnlyAccount) {
        const { error } = await supabase.auth.admin.deleteUser(id);
        if (error && !error.message.toLowerCase().includes('not found')) {
            throw new Error('Owner Google sign-in was rejected, but account cleanup failed');
        }
        // Usually removed by the auth.users foreign-key cascade; this also
        // cleans installations where the public profile has no cascade.
        await supabase.from('users').delete().eq('id', id);
    }

    throw new Error(OWNER_PASSWORD_REQUIRED);
};

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
    authMethod: AuthMethod = 'unknown',
): Promise<{ user: Record<string, unknown>; changed: boolean }> => {
    await rejectOwnerNonPasswordAuth(id, email, authMethod);
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
    if (isOwnerEmail(data.user.email)) throw new Error(OWNER_PASSWORD_REQUIRED);

    const hasGoogleIdentity = data.user.identities?.some(
        (identity) => identity.provider === 'google',
    );
    if (!hasGoogleIdentity) {
        throw new Error('Sign in with Google before linking a password');
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error('Failed to link password');
};
