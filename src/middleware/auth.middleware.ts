import { Response, NextFunction } from 'express';
import supabase from '../config/supabase';
import { sendError } from '../utils/response';
import { UserRole } from '../types';
import { AuthRequest } from '../types/express.d';

// ── Auth + profile cache ──────────────────────────────────────────────────────
// Caches the full auth result (user identity + profile) keyed by token.
// Avoids calling supabase.auth.getUser() on every request (1-10s network call).
interface CachedAuth {
    id: string;
    email: string;
    role: UserRole;
    gym_id?: string;
    expiry: number;
}

const authCache = new Map<string, CachedAuth>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Clean up expired entries periodically to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of authCache) {
        if (val.expiry < now) authCache.delete(key);
    }
}, 60_000);

// Invalidate all cache entries for a given user id (role changed in DB,
// sync just ran, manual revoke, etc.). O(n) but n is tiny.
export const invalidateAuthCacheForUser = (userId: string): void => {
    for (const [token, val] of authCache) {
        if (val.id === userId) authCache.delete(token);
    }
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        sendError(res, 'No token provided', 401);
        return;
    }

    const token = authHeader.split(' ')[1];

    // Check cache first — avoids slow remote getUser() call
    const cached = authCache.get(token);
    if (cached && cached.expiry > Date.now()) {
        req.user = { id: cached.id, email: cached.email, role: cached.role, gym_id: cached.gym_id };
        return next();
    }

    // Cache miss — verify token with Supabase (slow, 1-10s)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        authCache.delete(token);
        sendError(res, 'Invalid or expired token', 401);
        return;
    }

    // Fetch user profile (role + gym_id)
    const { data: profile } = await supabase
        .from('users')
        .select('role, gym_id')
        .eq('id', user.id)
        .single();

    const role = (profile?.role ?? 'member') as UserRole;
    const gymId = profile?.gym_id ?? undefined;

    // Only cache once a real profile row exists. Otherwise a request that
    // races ahead of /auth/sync would pin role='member' for 5 minutes
    // even after sync promotes the user.
    if (profile) {
        authCache.set(token, {
            id: user.id,
            email: user.email ?? '',
            role,
            gym_id: gymId,
            expiry: Date.now() + CACHE_TTL_MS,
        });
    }

    req.user = {
        id: user.id,
        email: user.email ?? '',
        role,
        gym_id: gymId,
    };

    next();
};
