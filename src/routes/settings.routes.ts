import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { updateSettingsSchema } from '../validators/settings.validator';
import * as SettingsController from '../controllers/settings.controller';

const router = Router();

// Only non-sensitive business identity fields are exposed to the public site.
router.get('/public', SettingsController.getPublic);

router.use(authenticate, authorize('owner'));

router.get('/', SettingsController.get);
router.put('/', validate(updateSettingsSchema), SettingsController.update);

export default router;
