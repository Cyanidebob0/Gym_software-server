import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as RefundService from '../services/refund.service';

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await RefundService.getAll();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch refunds';
        sendError(res, message, 400);
    }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await RefundService.create(req.body);
        sendSuccess(res, data, 'Refund request created', 201);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create refund';
        sendError(res, message, 400);
    }
};

export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await RefundService.updateStatus(req.params.id as string, req.body.status);
        sendSuccess(res, data, `Refund ${req.body.status}`);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update refund';
        sendError(res, message, 400);
    }
};
