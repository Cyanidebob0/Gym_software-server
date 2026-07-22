import { Request } from 'express';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
export const DEFAULT_HISTORY_LIMIT = 25;
export const MAX_HISTORY_LIMIT = 100;

export const parsePagination = (req: Request) => {
    const limit = Math.min(
        Math.max(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 1),
        MAX_LIMIT,
    );
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    return { limit, offset };
};

export type CursorValues = Record<string, string>;

export const parseCursorPagination = (req: Request) => {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), MAX_HISTORY_LIMIT)
        : DEFAULT_HISTORY_LIMIT;
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length > 0
        ? req.query.cursor
        : undefined;

    if (cursor && cursor.length > 2048) throw new Error('Invalid cursor');
    return { limit, cursor };
};

export const encodeCursor = (values: CursorValues): string =>
    Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');

export const decodeCursor = (cursor: string | undefined, fields: string[]): CursorValues | null => {
    if (!cursor) return null;

    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();

        const values: CursorValues = {};
        for (const field of fields) {
            const value = parsed[field];
            if (typeof value !== 'string' || value.length === 0 || value.length > 100) throw new Error();
            values[field] = value;
        }
        return values;
    } catch {
        throw new Error('Invalid cursor');
    }
};
