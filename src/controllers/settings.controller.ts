import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as SettingsService from '../services/settings.service';

export const get = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await SettingsService.get(req.user!.gym_id!);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch settings';
        sendError(res, message, 400);
    }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await SettingsService.upsert(req.user!.gym_id!, req.body);
        sendSuccess(res, data, 'Settings updated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update settings';
        sendError(res, message, 400);
    }
};
