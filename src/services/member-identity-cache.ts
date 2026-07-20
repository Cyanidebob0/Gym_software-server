import supabase from '../config/supabase';

type CachedMemberId = { id: string; expiresAt: number };

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CachedMemberId>();
const pending = new Map<string, Promise<string>>();

export const getMemberIdByUserId = async (userId: string): Promise<string> => {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.id;

    const existing = pending.get(userId);
    if (existing) return existing;

    const query = supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();
    const request = Promise.resolve(query)
        .then(({ data, error }) => {
            if (error || !data) throw new Error('Member not found');
            cache.set(userId, { id: data.id, expiresAt: Date.now() + CACHE_TTL_MS });
            return data.id;
        })
        .finally(() => pending.delete(userId));

    pending.set(userId, request);
    return request;
};

export const rememberMemberId = (userId: string, memberId: string): void => {
    cache.set(userId, { id: memberId, expiresAt: Date.now() + CACHE_TTL_MS });
};

export const invalidateMemberId = (userId: string): void => {
    cache.delete(userId);
    pending.delete(userId);
};
