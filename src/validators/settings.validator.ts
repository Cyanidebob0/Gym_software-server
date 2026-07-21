import { z } from 'zod';

export const updateSettingsSchema = z.object({
    gym_address: z.string().trim().max(500, 'Gym address cannot exceed 500 characters').optional(),
    gym_phone: z.string().trim().refine(
        (value) => value === '' || /^[6-9]\d{9}$/.test(value),
        'Enter a valid 10-digit Indian mobile number',
    ).optional(),
    expiry_reminder_days: z.number().int().min(1).max(30).optional(),
    online_registration: z.boolean().optional(),
    refunds_enabled: z.boolean().optional(),
    grace_period_days: z.number().int().min(0).max(30).optional(),
});
