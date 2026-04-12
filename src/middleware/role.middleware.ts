import { Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { UserRole } from '../types';
import { AuthRequest } from '../types/express.d';

export const authorize = (...roles: UserRole[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            sendError(res, 'Not authenticated', 401);
            return;
        }
        // super_admin bypasses all role checks
        if (req.user.role !== 'super_admin' && !roles.includes(req.user.role)) {
            sendError(res, 'Insufficient permissions', 403);
            return;
        }
        next();
    };
};
