import { Response, NextFunction } from 'express';
import supabase from '../config/supabase';
import { sendError } from '../utils/response';
import { UserRole } from '../types';
import { AuthRequest } from '../types/express.d';

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        sendError(res, 'No token provided', 401);
        return;
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        sendError(res, 'Invalid or expired token', 401);
        return;
    }

    const { data: profile } = await supabase
        .from('users')
        .select('role, gym_id')
        .eq('id', user.id)
        .single();

    req.user = {
        id: user.id,
        email: user.email ?? '',
        role: (profile?.role ?? 'member') as UserRole,
        gym_id: profile?.gym_id,
    };

    next();
};
