import { Router } from 'express';
import { me } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All auth (login, register, Google OAuth) is handled by Supabase Auth on the frontend.
// This route returns the server-side profile for an authenticated user.
router.get('/me', authenticate, me);

export default router;
