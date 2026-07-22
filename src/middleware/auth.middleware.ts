import { Response, NextFunction } from 'express';
import supabase from '../config/supabase';
import { sendError } from '../utils/response';
import { AuthMethod, UserRole } from '../types';
import { AuthRequest } from '../types/express.d';
import { getAuthMethodFromToken } from '../utils/auth-method';
import { isOwnerEmail } from '../config/whitelist';

// ── Auth + profile cache ──────────────────────────────────────────────────────
// Caches the full auth result (user identity + profile) keyed by token.
// Avoids calling supabase.auth.getUser() on every request (1-10s network call).
//
// This cache is never authorization truth: every cached field derives from the
// verified token's claims plus the static owner whitelist — no mutable database
// state is memoized here. Entry lifetime is capped at min(5 min, token exp), so
// an entry can never outlive the token that produced it. Mutable access checks
// (e.g. member access_state) query the database directly in
// membership-access.middleware.ts. See server/docs/caching.md.
interface CachedAuth {
    id: string;
    email: string;
    role: UserRole;
    authMethod: AuthMethod;
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
        req.user = { id: cached.id, email: cached.email, role: cached.role, authMethod: cached.authMethod };
        return next();
    }

    // Cache miss — verify the signed JWT. Supabase performs this locally when
    // the project uses asymmetric signing keys and safely falls back otherwise.
    const { data, error } = await supabase.auth.getClaims(token);
    const claims = data?.claims;

    if (error || !claims?.sub) {
        authCache.delete(token);
        sendError(res, 'Invalid or expired token', 401);
        return;
    }

    // Sweat Zone is a single-gym system: owners come from the server-side
    // whitelist and every other authenticated account is a member.
    const userId = claims.sub;
    const email = typeof claims.email === 'string' ? claims.email : '';
    const role: UserRole = isOwnerEmail(email) ? 'owner' : 'member';
    const authMethod = getAuthMethodFromToken(token);
    const tokenExpiry = typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + CACHE_TTL_MS;
    const expiry = Math.min(Date.now() + CACHE_TTL_MS, tokenExpiry);

    authCache.set(token, { id: userId, email, role, authMethod, expiry });

    req.user = {
        id: userId,
        email,
        role,
        authMethod,
    };

    next();
};
