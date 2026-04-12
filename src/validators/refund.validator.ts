import { z } from 'zod';

export const createRefundSchema = z.object({
    member_id: z.string().uuid('Invalid member ID'),
    payment_id: z.string().uuid('Invalid payment ID'),
    amount: z.number().nonnegative('Amount must be non-negative'),
    reason: z.string().optional(),
});

export const updateRefundSchema = z.object({
    status: z.enum(['approved', 'rejected']),
});
