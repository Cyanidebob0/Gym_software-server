import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as AuthService from '../services/auth.service';
import { invalidateAuthCacheForUser } from '../middleware/auth.middleware';

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await AuthService.getMe(req.user!.id);
        sendSuccess(res, user);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch user';
        sendError(res, message, 400);
    }
};

export const sync = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id, email } = req.user!;
        const name = req.body.name as string | undefined;
        const requestedRole = req.body.role as string | undefined;
        const { user, changed } = await AuthService.syncUser(id, email, name, requestedRole);
        // Bust cached role only when the DB row actually changed, so a stale
        // cache (e.g. racing /me request that pinned role='member') reflects
        // the new role on the next request. On no-op syncs (common path:
        // every page refresh refires SIGNED_IN) this is a no-op.
        if (changed) invalidateAuthCacheForUser(id);
        sendSuccess(res, user, 'User synced');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to sync user';
        sendError(res, message, 400);
    }
};
