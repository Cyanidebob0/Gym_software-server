import { Router } from 'express';
import authRoutes from './auth.routes';
import memberRoutes from './member.routes';
import planRoutes from './plan.routes';
import paymentRoutes from './payment.routes';
import attendanceRoutes from './attendance.routes';
import broadcastRoutes from './broadcast.routes';
import refundRoutes from './refund.routes';
import settingsRoutes from './settings.routes';
import meRoutes from './me.routes';
import dashboardRoutes from './dashboard.routes';
import workoutRoutes from './workout.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/members', memberRoutes);
router.use('/plans', planRoutes);
router.use('/payments', paymentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/broadcasts', broadcastRoutes);
router.use('/refunds', refundRoutes);
router.use('/settings', settingsRoutes);
router.use('/me', meRoutes);
router.use('/workouts', workoutRoutes);

export default router;
