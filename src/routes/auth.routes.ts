import { Router } from 'express';
import { me, sync, linkPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All auth (login, register, Google OAuth) is handled by Supabase Auth on the frontend.
// This route returns the server-side profile for an authenticated user.
router.get('/me', authenticate, me);

// Sync Supabase Auth user → users table (called after signup/OAuth)
router.post('/sync', authenticate, sync);

// Link a password to an existing OAuth-only account (no auth required — validates email exists as OAuth)
router.post('/link-password', linkPassword);

export default router;
