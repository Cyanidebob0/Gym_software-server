import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { createSessionSchema, updateSessionSchema } from '../validators/workout.validator';
import * as WorkoutController from '../controllers/workout.controller';

const router = Router();

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB per file
        files: 8,
    },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Unsupported file type: ${file.mimetype}`));
    },
});

router.use(authenticate, authorize('member', 'owner'));

// Exercise browsing (cached from ExerciseDB)
router.get('/exercises', WorkoutController.getExercises);
router.get('/exercises/filters', WorkoutController.getExerciseFilters);
router.post('/exercises/refresh', authorize('super_admin'), WorkoutController.refreshExercises);
router.get('/exercises/:id', WorkoutController.getExerciseDetail);

// Workout sessions
router.get('/sessions', WorkoutController.getSessions);
router.get('/sessions/:id', WorkoutController.getSession);
router.post('/sessions', validate(createSessionSchema), WorkoutController.createSession);
router.patch('/sessions/:id', validate(updateSessionSchema), WorkoutController.updateSession);
router.post('/sessions/:id/photos', photoUpload.array('photos', 8), WorkoutController.uploadSessionPhotos);
router.delete('/sessions/:id', WorkoutController.deleteSession);

// Progress
router.get('/progress/:exerciseId', WorkoutController.getProgress);

export default router;
