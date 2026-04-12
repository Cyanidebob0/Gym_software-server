import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { markAttendanceSchema, markCheckoutSchema } from '../validators/attendance.validator';
import * as AttendanceController from '../controllers/attendance.controller';

const router = Router();

router.use(authenticate, authorize('owner'));

router.get('/today-stats', AttendanceController.getTodayStats);
router.get('/date/:date', AttendanceController.getByDate);
router.get('/member/:memberId', AttendanceController.getByMember);
router.post('/mark-in', validate(markAttendanceSchema), AttendanceController.markIn);
router.patch('/:id/mark-out', validate(markCheckoutSchema), AttendanceController.markOut);
router.delete('/:id', AttendanceController.remove);

export default router;
