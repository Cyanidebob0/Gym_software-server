import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { createPaymentSchema } from '../validators/payment.validator';
import * as PaymentController from '../controllers/payment.controller';

const router = Router();

router.use(authenticate, authorize('owner'));

router.get('/', PaymentController.getAll);
router.get('/stats', PaymentController.getStats);
router.get('/pending-count', PaymentController.getPendingCount);
router.get('/:id', PaymentController.getById);
router.post('/', validate(createPaymentSchema), PaymentController.create);
router.patch('/:id/confirm', PaymentController.confirm);
router.patch('/:id/reject', PaymentController.reject);

export default router;
