import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { createSessionSchema, updateSessionSchema } from '../validators/workout.validator';
import * as WorkoutController from '../controllers/workout.controller';

const router = Router();

router.use(authenticate, authorize('member', 'owner'));

// Exercise browsing (cached from wger API)
router.get('/exercises', WorkoutController.getExercises);
router.get('/exercises/:id', WorkoutController.getExerciseDetail);

// Workout sessions
router.get('/sessions', WorkoutController.getSessions);
router.get('/sessions/:id', WorkoutController.getSession);
router.post('/sessions', validate(createSessionSchema), WorkoutController.createSession);
router.patch('/sessions/:id', validate(updateSessionSchema), WorkoutController.updateSession);
router.delete('/sessions/:id', WorkoutController.deleteSession);

// Progress
router.get('/progress/:exerciseId', WorkoutController.getProgress);

export default router;
