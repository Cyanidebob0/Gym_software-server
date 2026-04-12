import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as DashboardController from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate, authorize('owner'));

router.get('/', DashboardController.getDashboard);

export default router;
