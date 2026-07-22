import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { createPlanSchema, updatePlanSchema } from '../validators/plan.validator';
import * as PlanController from '../controllers/plan.controller';

const router = Router();

router.use(authenticate, authorize('owner'));

router.get('/', PlanController.getAll);
router.get('/active', PlanController.getActive);
router.get('/:id', PlanController.getById);
router.post('/', validate(createPlanSchema), PlanController.create);
router.patch('/:id', validate(updatePlanSchema), PlanController.update);
router.patch('/:id/toggle', PlanController.toggle);
router.patch('/:id/recommend', PlanController.recommend);

export default router;
