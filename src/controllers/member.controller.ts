import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/express.d';
import { parsePagination } from '../utils/pagination';
import * as MemberService from '../services/member.service';

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { limit, offset } = parsePagination(req);
        const data = await MemberService.getAll(limit, offset);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch members';
        sendError(res, message, 400);
    }
};

export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getById(req.params.id as string);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch member';
        sendError(res, message, 400);
    }
};

export const activatePendingMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.activatePendingMember(req.params.id as string, req.body);
        sendSuccess(res, data, 'Member added and activated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to activate member';
        sendError(res, message, 400);
    }
};

export const renewMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.renewMember(req.params.id as string, req.body);
        sendSuccess(res, data, req.body.has_paid ? 'Membership renewed' : 'Renewal assigned; payment required');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to renew member';
        sendError(res, message, 400);
    }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.update(req.params.id as string, req.body);
        sendSuccess(res, data, 'Member updated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update member';
        sendError(res, message, 400);
    }
};

export const updateAccessState = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const state = req.body.state;
        if (!['normal', 'cancelled', 'blocked'].includes(state)) {
            sendError(res, 'State must be normal, cancelled, or blocked', 422);
            return;
        }
        const data = await MemberService.updateAccessState(req.params.id as string, state);
        sendSuccess(res, data, state === 'normal' ? 'Member access restored' : `Member ${state}`);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update member access';
        sendError(res, message, 400);
    }
};

export const getStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getStats();
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch stats';
        sendError(res, message, 400);
    }
};

// Member self-registration endpoints
export const getMyStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getStatusByUserId(req.user!.id);
        sendSuccess(res, data); // null if not registered
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch status';
        sendError(res, message, 400);
    }
};

export const selfRegister = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            sendError(res, 'Upload a photo of your selected ID document', 422);
            return;
        }
        const data = await MemberService.selfRegister(
            req.user!.id,
            req.user!.email,
            req.body,
            req.file,
        );
        sendSuccess(res, data, 'Registration submitted', 201);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to register';
        sendError(res, message, 400);
    }
};

export const getMyPlans = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getActivePlansByUserId(req.user!.id);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch plans';
        sendError(res, message, 400);
    }
};

export const activateWithPayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.activateWithPayment(req.user!.id, req.body);
        sendSuccess(res, data, 'Membership activated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to activate membership';
        sendError(res, message, 400);
    }
};

export const approveMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const status = req.body.status;
        if (!['approved', 'blocked'].includes(status)) {
            sendError(res, 'Status must be approved or blocked', 422);
            return;
        }
        const data = status === 'blocked'
            ? await MemberService.updateAccessState(req.params.id as string, 'blocked')
            : await MemberService.update(req.params.id as string, { status, access_state: 'normal' });
        sendSuccess(res, data, `Member ${status}`);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update member';
        sendError(res, message, 400);
    }
};

// Member self-service endpoints
export const getMyProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getProfileByUserId(req.user!.id);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch profile';
        sendError(res, message, 400);
    }
};

export const updateMyProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.updateProfileByUserId(req.user!.id, req.body);
        sendSuccess(res, data, 'Profile updated');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update profile';
        sendError(res, message, 400);
    }
};

export const getMyAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getAttendanceByUserId(req.user!.id);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch attendance';
        sendError(res, message, 400);
    }
};

export const getMyPayments = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getPaymentsByUserId(req.user!.id);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch payments';
        sendError(res, message, 400);
    }
};

export const getMyBroadcasts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getBroadcastsByUserId(req.user!.id);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch broadcasts';
        sendError(res, message, 400);
    }
};

export const selfCheckIn = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.selfCheckIn(req.user!.id);
        sendSuccess(res, data, data.already_checked_in ? 'Already checked in' : 'Checked in', 200);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to check in';
        sendError(res, message, 400);
    }
};

export const selfCheckOut = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.selfCheckOut(req.user!.id);
        sendSuccess(res, data, 'Checked out');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to check out';
        sendError(res, message, 400);
    }
};

export const getTodayCheckIn = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = await MemberService.getTodayCheckIn(req.user!.id);
        sendSuccess(res, data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch check-in status';
        sendError(res, message, 400);
    }
};
