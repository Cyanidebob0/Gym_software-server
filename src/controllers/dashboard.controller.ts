import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as DashboardService from '../services/dashboard.service';

export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await DashboardService.getDashboard();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
        sendError(res, message, 400);
    }
};
