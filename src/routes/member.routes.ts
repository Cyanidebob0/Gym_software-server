import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { createMemberSchema, updateMemberSchema } from '../validators/member.validator';
import * as MemberController from '../controllers/member.controller';

const router = Router();

// All routes require authentication + owner role
router.use(authenticate, authorize('owner'));

router.get('/', MemberController.getAll);
router.get('/stats', MemberController.getStats);
router.get('/:id', MemberController.getById);
router.post('/', validate(createMemberSchema), MemberController.create);
router.patch('/:id', validate(updateMemberSchema), MemberController.update);
router.patch('/:id/approve', MemberController.approveMember);

export default router;
