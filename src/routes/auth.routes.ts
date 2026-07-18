import { Router } from 'express';
import { me, sync, linkPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { linkPasswordSchema } from '../validators/auth.validator';

const router = Router();

// All auth (login, register, Google OAuth) is handled by Supabase Auth on the frontend.
// This route returns the server-side profile for an authenticated user.
router.get('/me', authenticate, me);

// Sync Supabase Auth user → users table (called after signup/OAuth)
router.post('/sync', authenticate, sync);

// Link a password only after the user has proved ownership by signing in.
// The account id comes from the verified bearer token, never from the body.
router.post('/link-password', authenticate, validate(linkPasswordSchema), linkPassword);

export default router;
