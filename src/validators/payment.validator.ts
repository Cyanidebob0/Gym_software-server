import { z } from 'zod';

export const createPaymentSchema = z.object({
    member_id: z.string().uuid('Invalid member ID'),
    plan_id: z.string().uuid().optional(),
    amount: z.number().nonnegative('Amount must be non-negative'),
    mode: z.enum(['online', 'offline']),
    method: z.enum(['cash', 'upi', 'card', 'online']),
    status: z.enum(['completed', 'pending', 'refunded', 'failed']).optional(),
    date: z.string().optional(),
});
