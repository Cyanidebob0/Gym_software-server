import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import { parsePagination } from '../utils/pagination';
import * as PaymentService from '../services/payment.service';

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { limit, offset } = parsePagination(req);
        const data = await PaymentService.getAll(limit, offset);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch payments';
        sendError(res, message, 400);
    }
};

export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PaymentService.getById(req.params.id as string);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch payment';
        sendError(res, message, 400);
    }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PaymentService.create(req.body);
        sendSuccess(res, data, 'Payment created', 201);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create payment';
        sendError(res, message, 400);
    }
};

export const getStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PaymentService.getStats();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch payment stats';
        sendError(res, message, 400);
    }
};

export const getPendingCount = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PaymentService.getPendingCount();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch pending payment count';
        sendError(res, message, 400);
    }
};

export const confirm = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PaymentService.confirm(req.params.id as string);
        sendSuccess(res, data, 'Payment confirmed and membership activated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to confirm payment';
        sendError(res, message, 400);
    }
};
