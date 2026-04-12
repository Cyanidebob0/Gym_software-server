import { z } from 'zod';

export const sendBroadcastSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    message: z.string().min(1, 'Message is required'),
    target: z.enum(['all', 'active', 'expiring']).optional(),
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
});
