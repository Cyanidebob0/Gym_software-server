import supabase from '../config/supabase';
import { isAdminEmail, isOwnerEmail } from '../config/whitelist';
import { UserRole } from '../types';

// All sign-in / sign-up / OAuth is handled by Supabase Auth on the frontend.
// The server only needs to expose a /me endpoint to return the user's profile
// and a /sync endpoint to mirror auth users into the application users table.

export const getMe = async (userId: string) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, role, gym_id, created_at')
        .eq('id', userId)
        .single();

    if (error || !data) throw new Error('User not found');
    return data;
};

// Resolve the authoritative role for a given email + requested role.
// Whitelists always win; never trust a client-supplied 'super_admin' or 'owner'
// from user_metadata without checking.
const resolveRole = (email: string, requestedRole?: string): UserRole => {
    if (isAdminEmail(email)) return 'super_admin';
    if (isOwnerEmail(email)) return 'owner';
    // Anyone else requesting privileged role falls back to member.
    if (requestedRole === 'owner' || requestedRole === 'super_admin') return 'member';
    return 'member';
};

// Called after Supabase signup / OAuth to mirror the auth user into users table.
// - First-time sync inserts the row with the correct role.
// - Subsequent syncs reconcile the role in case the whitelist changed
//   (e.g. an admin email was added after the user already signed up once).
// - Never overwrites gym_id once set.
// Returns { user, changed } so the controller only busts the auth cache when
// the DB actually changed — otherwise every page refresh (which re-fires
// SIGNED_IN and thus /auth/sync) would force a remote token re-verification.
export const syncUser = async (
    id: string,
    email: string,
    name?: string,
    requestedRole?: string,
): Promise<{ user: Record<string, unknown>; changed: boolean }> => {
    const role = resolveRole(email, requestedRole);

    const { data: existing } = await supabase
        .from('users')
        .select('id, email, role, gym_id')
        .eq('id', id)
        .single();

    if (existing) {
        // Reconcile role only if the whitelist says this user should be
        // higher-privileged than what's stored. We never auto-demote — that
        // must be a deliberate admin action.
        const rank: Record<UserRole, number> = { member: 0, owner: 1, super_admin: 2 };
        let changed = false;
        let current = existing;
        if (rank[role] > rank[existing.role as UserRole]) {
            const { data: updated, error } = await supabase
                .from('users')
                .update({ role })
                .eq('id', id)
                .select('id, email, role, gym_id')
                .single();
            if (error) throw new Error('Failed to update user role');
            current = updated;
            changed = true;
        }
        if (role === 'owner' && !current.gym_id) {
            const gymId = await ensureOwnerGym(id, name);
            const { data: updated, error } = await supabase
                .from('users')
                .update({ gym_id: gymId })
                .eq('id', id)
                .select('id, email, role, gym_id')
                .single();
            if (error) throw new Error('Failed to assign gym to owner');
            current = updated;
            changed = true;
        }
        return { user: current, changed };
    }

    const { data, error } = await supabase
        .from('users')
        .insert({ id, email, name: name ?? '', role })
        .select('id, email, role, gym_id')
        .single();

    if (error) throw new Error('Failed to sync user');

    if (role === 'owner') {
        const gymId = await ensureOwnerGym(id, name);
        const { data: updated, error: linkErr } = await supabase
            .from('users')
            .update({ gym_id: gymId })
            .eq('id', id)
            .select('id, email, role, gym_id')
            .single();
        if (linkErr) throw new Error('Failed to assign gym to owner');
        return { user: updated, changed: true };
    }

    return { user: data, changed: true };
};

// Link a password to an existing OAuth-only account.
// Uses the admin API to set the password so the user can also login with email.
export const linkPassword = async (email: string, password: string): Promise<void> => {
    const { data: userId, error: lookupErr } = await supabase.rpc('get_auth_user_id_by_email', {
        lookup_email: email,
    });
    if (lookupErr || !userId) throw new Error('No account found with this email');

    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(`Failed to link password: ${error.message}`);
};

// Single-tenant shortcut: each owner gets exactly one gym, auto-provisioned
// on first sync. Race-safe via the unique constraint on gyms.owner_id —
// concurrent syncs both read empty, but only one insert wins; the loser
// re-reads and returns the winner's row.
const ensureOwnerGym = async (ownerId: string, name?: string): Promise<string> => {
    const readExisting = async (): Promise<string | null> => {
        const { data } = await supabase
            .from('gyms')
            .select('id')
            .eq('owner_id', ownerId)
            .maybeSingle();
        return data?.id ?? null;
    };

    const existingId = await readExisting();
    if (existingId) return existingId;

    const gymName = name ? `${name}'s Gym` : 'My Gym';
    const { data, error } = await supabase
        .from('gyms')
        .insert({ name: gymName, address: '', phone: '', owner_id: ownerId })
        .select('id')
        .single();
    if (data) return data.id;

    // Insert lost the race — the unique constraint rejected us. Re-read.
    if (error?.code === '23505') {
        const winnerId = await readExisting();
        if (winnerId) return winnerId;
    }
    throw new Error('Failed to create gym');
};
