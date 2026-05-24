import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { selfRegisterMemberSchema, memberPaymentSchema, updateProfileSchema } from '../validators/member.validator';
import * as MemberController from '../controllers/member.controller';

const router = Router();

// Member self-service routes — any authenticated user with member or owner role
router.use(authenticate, authorize('member', 'owner'));

// Registration flow
router.get('/status', MemberController.getMyStatus);
router.post('/register', validate(selfRegisterMemberSchema), MemberController.selfRegister);
router.get('/plans', MemberController.getMyPlans);
router.post('/activate', validate(memberPaymentSchema), MemberController.activateWithPayment);

// Existing self-service
router.get('/profile', MemberController.getMyProfile);
router.patch('/profile', validate(updateProfileSchema), MemberController.updateMyProfile);
router.get('/attendance', MemberController.getMyAttendance);
router.get('/payments', MemberController.getMyPayments);
router.get('/broadcasts', MemberController.getMyBroadcasts);

// Self check-in/out
router.get('/today-checkin', MemberController.getTodayCheckIn);
router.post('/check-in', MemberController.selfCheckIn);
router.post('/check-out', MemberController.selfCheckOut);

export default router;
