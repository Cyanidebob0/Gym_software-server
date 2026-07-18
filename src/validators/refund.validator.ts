import { z } from 'zod';

export const createRefundSchema = z.object({
    payment_id: z.string().uuid('Invalid payment ID'),
    amount: z.number().finite().positive('Amount must be greater than zero'),
    reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
});

export const updateRefundSchema = z.object({
    status: z.enum(['approved', 'rejected']),
});
