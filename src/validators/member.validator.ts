import { z } from 'zod';

export const createMemberSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(10, 'Phone must be at least 10 digits'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    gov_id_type: z.enum(['aadhaar', 'pan', 'voter_id', 'passport', 'driving_license']).optional(),
    gov_id_number: z.string().optional(),
    plan_id: z.string().uuid().optional(),
    status: z.enum(['active', 'expired', 'expiring_soon', 'blocked', 'pending', 'approved']).optional(),
    join_date: z.string().optional(),
    expiry_date: z.string().optional(),
});

export const updateMemberSchema = createMemberSchema.partial();

export const selfRegisterMemberSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(10, 'Phone must be at least 10 digits'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    gov_id_type: z.enum(['aadhaar', 'pan', 'voter_id', 'passport', 'driving_license']).optional(),
    gov_id_number: z.string().optional(),
});

export const memberPaymentSchema = z.object({
    plan_id: z.string().uuid('Valid plan is required'),
    method: z.enum(['cash', 'upi', 'card']),
    amount: z.number().positive('Amount must be positive'),
});

export const updateProfileSchema = z.object({
    phone: z.string().min(10, 'Phone must be at least 10 digits').optional(),
    address: z.string().max(500).optional(),
    gender: z.string().max(20).optional(),
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
});
