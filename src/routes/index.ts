import { Router } from 'express';
import authRoutes from './auth.routes';

const router = Router();

router.use('/auth', authRoutes);

// Future routes registered here:
// router.use('/members', memberRoutes);
// router.use('/plans', planRoutes);
// router.use('/payments', paymentRoutes);
// router.use('/attendance', attendanceRoutes);

export default router;
