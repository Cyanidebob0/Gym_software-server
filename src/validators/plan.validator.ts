import { z } from 'zod';

export const createPlanSchema = z.object({
    name: z.string().min(1, 'Plan name is required'),
    duration_days: z.number().int().positive('Duration must be positive'),
    price: z.number().nonnegative('Price must be non-negative'),
    is_active: z.boolean().optional(),
});

export const updatePlanSchema = createPlanSchema.partial();
