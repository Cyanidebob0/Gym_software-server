import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { createRefundSchema, updateRefundSchema } from '../validators/refund.validator';
import * as RefundController from '../controllers/refund.controller';

const router = Router();

router.use(authenticate, authorize('owner'));

router.get('/', RefundController.getAll);
router.post('/', validate(createRefundSchema), RefundController.create);
router.patch('/:id', validate(updateRefundSchema), RefundController.updateStatus);

export default router;
