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
