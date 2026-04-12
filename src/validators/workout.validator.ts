import { z } from 'zod';

const exerciseIdSchema = z.union([
    z.number().int().positive(),
    z.string().min(1).max(100),
]);

export const createSessionSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    name: z.string().max(100).optional(),
    notes: z.string().max(500).optional(),
    duration_min: z.number().int().min(1).max(600).optional(),
    sets: z.array(z.object({
        exercise_id: exerciseIdSchema,
        exercise_name: z.string().min(1).max(200),
        set_number: z.number().int().min(1).max(50),
        reps: z.number().int().min(0).max(999).optional(),
        weight_kg: z.number().min(0).max(9999).optional(),
        notes: z.string().max(200).optional(),
    })).min(1, 'At least one set is required'),
});

export const updateSessionSchema = z.object({
    name: z.string().max(100).optional(),
    notes: z.string().max(500).optional(),
    duration_min: z.number().int().min(1).max(600).optional(),
});
