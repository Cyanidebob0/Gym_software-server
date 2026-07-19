import { z } from 'zod';

export const createPlanSchema = z.object({
    name: z.string().trim().min(1, 'Plan name is required').max(80, 'Plan name is too long'),
    duration_days: z.number().int().positive('Duration must be positive'),
    price: z.number().nonnegative('Price must be non-negative'),
    amenities: z.array(
        z.string().trim().min(1, 'Amenity cannot be empty').max(80, 'Amenity is too long'),
    ).max(30, 'A plan can have at most 30 amenities').optional(),
    is_active: z.boolean().optional(),
});

export const updatePlanSchema = createPlanSchema.partial();
