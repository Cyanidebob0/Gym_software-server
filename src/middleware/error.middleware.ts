import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const errorHandler = (
    err: Error & { statusCode?: number; isOperational?: boolean },
    req: Request,
    res: Response,
    _next: NextFunction
) => {
    logger.error(err.message, { path: req.path });
    const statusCode = err.statusCode ?? 500;
    const message = err.isOperational ? err.message : 'Internal server error';
    res.status(statusCode).json({ success: false, message });
};

export const notFound = (req: Request, res: Response) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
};
