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
        const { user, changed } = await AuthService.syncUser(id, email, name, req.user!.authMethod);
        if (changed) invalidateAuthCacheForUser(id);
        sendSuccess(res, user, 'User synced');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to sync user';
        if (message === AuthService.OWNER_PASSWORD_REQUIRED) {
            invalidateAuthCacheForUser(req.user!.id);
        }
        sendError(res, message, message === AuthService.OWNER_PASSWORD_REQUIRED ? 403 : 400);
    }
};

export const linkPassword = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { password } = req.body;
        await AuthService.linkPassword(req.user!.id, password);
        sendSuccess(res, null, 'Password linked successfully');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to link password';
        sendError(res, message, 400);
    }
};
