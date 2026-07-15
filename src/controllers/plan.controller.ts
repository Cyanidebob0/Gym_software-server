import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as PlanService from '../services/plan.service';

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PlanService.getAll();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch plans';
        sendError(res, message, 400);
    }
};

export const getActive = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PlanService.getActive();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch active plans';
        sendError(res, message, 400);
    }
};

export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PlanService.getById(req.params.id as string);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch plan';
        sendError(res, message, 400);
    }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PlanService.create(req.body);
        sendSuccess(res, data, 'Plan created', 201);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create plan';
        sendError(res, message, 400);
    }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PlanService.update(req.params.id as string, req.body);
        sendSuccess(res, data, 'Plan updated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update plan';
        sendError(res, message, 400);
    }
};

export const toggle = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await PlanService.toggle(req.params.id as string);
        sendSuccess(res, data, 'Plan toggled');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to toggle plan';
        sendError(res, message, 400);
    }
};
