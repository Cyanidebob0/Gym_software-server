import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as AuthService from '../services/auth.service';

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
        const data = await AuthService.syncUser(id, email, name);
        sendSuccess(res, data, 'User synced');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to sync user';
        sendError(res, message, 400);
    }
};
