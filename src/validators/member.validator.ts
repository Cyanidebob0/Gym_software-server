import { z } from 'zod';

const memberDetailsSchema = z.object({
    name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
    email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
    address: z.string().trim().max(500).optional(),
    gov_id_type: z.enum(['aadhaar', 'pan', 'voter_id', 'passport', 'driving_license']).optional(),
    gov_id_number: z.string().trim().max(100).optional(),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

export const createMemberSchema = memberDetailsSchema.extend({
    plan_id: z.string().uuid('Select a valid membership plan'),
    join_date: isoDateSchema,
    days_remaining: z.number().int().min(0, 'Days remaining cannot be negative').max(3650),
    has_paid: z.boolean(),
    payment_amount: z.number().nonnegative('Payment amount cannot be negative').optional(),
    payment_method: z.enum(['cash', 'upi', 'card', 'online']).optional(),
    payment_date: isoDateSchema.optional(),
}).superRefine((data, ctx) => {
    if (!data.has_paid) return;
    if (!data.payment_method) {
        ctx.addIssue({ code: 'custom', path: ['payment_method'], message: 'Select a payment method' });
    }
    if (!data.payment_date) {
        ctx.addIssue({ code: 'custom', path: ['payment_date'], message: 'Select the payment date' });
    }
});

export const activatePendingMemberSchema = z.object({
    plan_id: z.string().uuid('Select a valid membership plan'),
    join_date: isoDateSchema,
    has_paid: z.boolean(),
    payment_method: z.enum(['cash', 'upi', 'card', 'online']).optional(),
    payment_date: isoDateSchema.optional(),
}).superRefine((data, ctx) => {
    if (!data.has_paid) return;
    if (!data.payment_method) {
        ctx.addIssue({ code: 'custom', path: ['payment_method'], message: 'Select a payment method' });
    }
    if (!data.payment_date) {
        ctx.addIssue({ code: 'custom', path: ['payment_date'], message: 'Select the payment date' });
    }
});

export const renewMemberSchema = z.object({
    plan_id: z.string().uuid('Select a valid membership plan'),
    has_paid: z.boolean(),
    payment_method: z.enum(['cash', 'upi', 'card', 'online']).optional(),
    payment_date: isoDateSchema.optional(),
}).superRefine((data, ctx) => {
    if (!data.has_paid) return;
    if (!data.payment_method) {
        ctx.addIssue({ code: 'custom', path: ['payment_method'], message: 'Select a payment method' });
    }
    if (!data.payment_date) {
        ctx.addIssue({ code: 'custom', path: ['payment_date'], message: 'Select the payment date' });
    }
});

export const updateMemberSchema = memberDetailsSchema.partial().extend({
    plan_id: z.string().uuid().optional(),
    status: z.enum(['active', 'expired', 'expiring_soon', 'blocked', 'pending', 'approved']).optional(),
    join_date: isoDateSchema.optional(),
    expiry_date: isoDateSchema.optional(),
});

export const selfRegisterMemberSchema = z.object({
    name: z.string()
        .trim()
        .min(2, 'Full name must be at least 2 characters')
        .max(100, 'Full name cannot exceed 100 characters')
        .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, 'Full name contains invalid characters'),
    phone: z.string()
        .trim()
        .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
    address: z.string()
        .trim()
        .min(10, 'Address must be at least 10 characters')
        .max(500, 'Address cannot exceed 500 characters'),
    gov_id_type: z.enum(
        ['aadhaar', 'pan', 'voter_id', 'passport', 'driving_license'],
        { message: 'Select an ID type' },
    ),
});

export const memberPaymentSchema = z.object({
    plan_id: z.string().uuid('Valid plan is required'),
    method: z.enum(['cash', 'upi', 'card']),
    amount: z.number().positive('Amount must be positive'),
});

export const memberPaymentRequestSchema = z.object({
    plan_id: z.string().uuid('Select a valid membership plan'),
    method: z.enum(['cash', 'upi'], { message: 'Choose Cash or Offline UPI' }),
});

export const updateProfileSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100).optional(),
    phone: z.string().min(10, 'Phone must be at least 10 digits').optional(),
    address: z.string().max(500).optional(),
    gender: z.string().max(20).optional(),
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
});
