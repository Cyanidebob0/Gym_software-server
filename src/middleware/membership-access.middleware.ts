import { NextFunction, Response } from 'express';
import supabase from '../config/supabase';
import { AuthRequest } from '../types/express.d';
import { sendError } from '../utils/response';

// Authorization decision — deliberately queries access_state fresh on every
// request instead of any process-local cache, so blocking or cancelling a
// member takes effect immediately on all instances (see server/docs/caching.md).
export const requireWritableMembership = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    if (!req.user || req.user.role === 'owner') {
        next();
        return;
    }

    const { data: member, error } = await supabase
        .from('members')
        .select('access_state')
        .eq('user_id', req.user.id)
        .maybeSingle();

    if (error || !member) {
        sendError(res, 'Member profile not found', 403);
        return;
    }
    if (member.access_state === 'blocked') {
        sendError(res, 'Your account is blocked. Contact the gym owner.', 403);
        return;
    }
    if (member.access_state === 'cancelled') {
        sendError(res, 'Your membership is cancelled and currently read-only.', 403);
        return;
    }
    next();
};

