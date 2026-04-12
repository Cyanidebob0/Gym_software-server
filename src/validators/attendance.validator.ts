import { z } from 'zod';

export const markAttendanceSchema = z.object({
    member_id: z.string().uuid('Invalid member ID'),
    check_in: z.string().min(1, 'Check-in time is required'),
    date: z.string().optional(),
});

export const markCheckoutSchema = z.object({
    check_out: z.string().min(1, 'Check-out time is required'),
});
