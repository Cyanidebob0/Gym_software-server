import { Response } from 'express';

export const sendSuccess = (
    res: Response,
    data: unknown = null,
    message = 'Success',
    statusCode = 200
) => {
    return res.status(statusCode).json({ success: true, message, data });
};

export const sendError = (
    res: Response,
    message = 'Something went wrong',
    statusCode = 500,
    errors: unknown = null
) => {
    const body: Record<string, unknown> = { success: false, message };
    if (errors) body.errors = errors;
    return res.status(statusCode).json(body);
};
