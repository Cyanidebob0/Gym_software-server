import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendBroadcastSchema } from '../validators/broadcast.validator';
import * as BroadcastController from '../controllers/broadcast.controller';

const router = Router();

router.use(authenticate, authorize('owner'));

router.get('/', BroadcastController.getAll);
router.post('/', validate(sendBroadcastSchema), BroadcastController.send);
router.patch('/:id', BroadcastController.update);
router.delete('/:id', BroadcastController.remove);

export default router;
