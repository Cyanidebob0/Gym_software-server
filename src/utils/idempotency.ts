import { createHash, randomUUID } from 'node:crypto';
import { Request } from 'express';

const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stableValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, stableValue(nested)]),
        );
    }
    return value;
};

export const requestIdempotencyKey = (req: Request): string => {
    const value = req.get('Idempotency-Key')?.trim();
    if (!value) return randomUUID();
    if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
        throw new Error('Idempotency-Key must be a UUID');
    }
    return value.toLowerCase();
};

export const financialMutation = (
    operation: string,
    payload: Record<string, unknown>,
    idempotencyKey: string = randomUUID(),
) => ({
    idempotencyKey,
    requestHash: createHash('sha256')
        .update(JSON.stringify(stableValue({ operation, payload })))
        .digest('hex'),
});

