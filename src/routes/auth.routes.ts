import { Router } from 'express';
import { accountStatus, me, sync } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All auth (login, register, Google OAuth) is handled by Supabase Auth on the frontend.
// This route returns the server-side profile for an authenticated user.
router.post('/account-status', accountStatus);
router.get('/me', authenticate, me);

// Sync Supabase Auth user → users table (called after signup/OAuth)
router.post('/sync', authenticate, sync);

export default router;
