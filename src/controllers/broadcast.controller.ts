import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as BroadcastService from '../services/broadcast.service';

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await BroadcastService.getAll(req.user!.gym_id!);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch broadcasts';
        sendError(res, message, 400);
    }
};

export const send = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await BroadcastService.send(req.user!.gym_id!, req.user!.id, req.body);
        sendSuccess(res, data, 'Broadcast sent', 201);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to send broadcast';
        sendError(res, message, 400);
    }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await BroadcastService.update(req.user!.gym_id!, req.params.id as string, req.body);
        sendSuccess(res, data, 'Broadcast updated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update broadcast';
        sendError(res, message, 400);
    }
};

export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await BroadcastService.remove(req.user!.gym_id!, req.params.id as string);
        sendSuccess(res, null, 'Broadcast deleted');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete broadcast';
        sendError(res, message, 400);
    }
};
