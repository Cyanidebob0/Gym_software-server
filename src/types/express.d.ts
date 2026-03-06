import { Request } from 'express';
import { AuthUser } from './index';

export interface AuthRequest extends Request {
    user?: AuthUser;
}
