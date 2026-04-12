import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as WorkoutService from '../services/workout.service';

const parseExerciseIdParam = (value: string | string[] | undefined) => {
    const normalized = Array.isArray(value) ? value[0] : value;
    if (!normalized) throw new Error('Exercise id is required');
    return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
};

export const getExercises = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { search, category, limit, offset } = req.query;
        const data = await WorkoutService.getExercises(
            search as string | undefined,
            category as string | undefined,
            Number(limit) || 20,
            Number(offset) || 0,
        );
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch exercises';
        sendError(res, message, 400);
    }
};

export const getExerciseDetail = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const exerciseId = parseExerciseIdParam(req.params.id);
        const data = await WorkoutService.getExerciseDetail(exerciseId);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch exercise';
        sendError(res, message, 400);
    }
};

export const getSessions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { limit, offset } = req.query;
        const data = await WorkoutService.getSessions(req.user!.id, Number(limit) || 20, Number(offset) || 0);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch sessions';
        sendError(res, message, 400);
    }
};

export const getSession = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await WorkoutService.getSession(req.user!.id, req.params.id as string);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch session';
        sendError(res, message, 400);
    }
};

export const createSession = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await WorkoutService.createSession(req.user!.id, req.body);
        sendSuccess(res, data, 'Workout logged', 201);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create session';
        sendError(res, message, 400);
    }
};

export const updateSession = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await WorkoutService.updateSession(req.user!.id, req.params.id as string, req.body);
        sendSuccess(res, data, 'Session updated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update session';
        sendError(res, message, 400);
    }
};

export const deleteSession = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await WorkoutService.deleteSession(req.user!.id, req.params.id as string);
        sendSuccess(res, null, 'Session deleted');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete session';
        sendError(res, message, 400);
    }
};

export const getProgress = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const exerciseId = parseExerciseIdParam(req.params.exerciseId);
        const data = await WorkoutService.getProgress(req.user!.id, exerciseId);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch progress';
        sendError(res, message, 400);
    }
};
