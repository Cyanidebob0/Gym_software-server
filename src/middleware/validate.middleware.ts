import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodIssue } from 'zod';
import { sendError } from '../utils/response';

export const validate = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.issues.map((e: ZodIssue) => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            sendError(res, 'Validation failed', 422, errors);
            return;
        }
        req.body = result.data;
        next();
    };
};
