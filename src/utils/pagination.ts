import { Request } from 'express';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const parsePagination = (req: Request) => {
    const limit = Math.min(
        Math.max(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 1),
        MAX_LIMIT,
    );
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    return { limit, offset };
};
