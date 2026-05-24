import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as WorkoutService from '../services/workout.service';

const parseExerciseIdParam = (value: string | string[] | undefined) => {
    const normalized = Array.isArray(value) ? value[0] : value;
    if (!normalized) throw new Error('Exercise id is required');
    return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
};

const asString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

export const getExercises = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { search, bodyPart, muscle, equipment, limit, offset } = req.query;
        const data = await WorkoutService.getExercises({
            search: asString(search),
            bodyPart: asString(bodyPart),
            muscle: asString(muscle),
            equipment: asString(equipment),
            limit: Number(limit) || 20,
            offset: Number(offset) || 0,
        });
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch exercises';
        sendError(res, message, 400);
    }
};

export const getExerciseFilters = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await WorkoutService.getExerciseFilters();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch exercise filters';
        sendError(res, message, 400);
    }
};

export const refreshExercises = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await WorkoutService.refreshExercises();
        sendSuccess(res, data, 'Exercise cache refreshed');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to refresh exercise cache';
        sendError(res, message, 500);
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

export const uploadSessionPhotos = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const files = (req.files as Express.Multer.File[] | undefined) || [];
        if (files.length === 0) {
            sendError(res, 'No files uploaded', 400);
            return;
        }
        const urls = await WorkoutService.uploadSessionPhotos(
            req.user!.id,
            req.params.id as string,
            files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype, size: f.size })),
        );
        sendSuccess(res, { image_urls: urls }, 'Photos uploaded');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to upload photos';
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
