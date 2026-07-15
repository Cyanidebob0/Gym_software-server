import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import * as AttendanceService from '../services/attendance.service';

export const getByDate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const date = (req.params.date as string) || new Date().toISOString().split('T')[0];
        const data = await AttendanceService.getByDate(date);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch attendance';
        sendError(res, message, 400);
    }
};

export const getByMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await AttendanceService.getByMember(req.params.memberId as string);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch member attendance';
        sendError(res, message, 400);
    }
};

export const getTodayStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await AttendanceService.getTodayStats();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch today stats';
        sendError(res, message, 400);
    }
};

export const markIn = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await AttendanceService.markIn(req.body);
        sendSuccess(res, data, 'Attendance marked', 201);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to mark attendance';
        sendError(res, message, 400);
    }
};

export const markOut = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await AttendanceService.markOut(req.params.id as string, req.body.check_out);
        sendSuccess(res, data, 'Check-out marked');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to mark check-out';
        sendError(res, message, 400);
    }
};

export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await AttendanceService.remove(req.params.id as string);
        sendSuccess(res, null, 'Attendance record removed');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to remove attendance';
        sendError(res, message, 400);
    }
};
