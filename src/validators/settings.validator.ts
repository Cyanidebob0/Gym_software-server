import { z } from 'zod';

export const updateSettingsSchema = z.object({
    gym_name: z.string().optional(),
    gym_address: z.string().optional(),
    gym_phone: z.string().optional(),
    expiry_reminder_days: z.number().int().nonnegative().optional(),
    sms_reminders: z.boolean().optional(),
    online_registration: z.boolean().optional(),
    refunds_enabled: z.boolean().optional(),
    grace_period_days: z.number().int().nonnegative().optional(),
});
