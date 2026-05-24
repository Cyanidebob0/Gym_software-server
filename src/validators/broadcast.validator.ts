import { z } from 'zod';

export const sendBroadcastSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    message: z.string().min(1, 'Message is required'),
    target: z.enum(['all', 'active', 'expiring']).optional(),
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
});

export const updateBroadcastSchema = z.object({
    title: z.string().min(1, 'Title is required').optional(),
    message: z.string().min(1, 'Message is required').optional(),
    target: z.enum(['all', 'active', 'expiring']).optional(),
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
});
