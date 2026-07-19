import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import {
    createSessionSchema,
    updateSessionSchema,
    saveExerciseSchema,
    createPlaylistSchema,
    updatePlaylistSchema,
    addPlaylistExercisesSchema,
} from '../validators/workout.validator';
import * as WorkoutController from '../controllers/workout.controller';
import { requireWritableMembership } from '../middleware/membership-access.middleware';

const router = Router();

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 4,
    },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Unsupported file type: ${file.mimetype}`));
    },
});

const photoUploadRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many photo uploads. Please try again later.' },
});

router.use(authenticate, authorize('member', 'owner'));

// Exercise browsing (cached from ExerciseDB)
router.get('/exercises', WorkoutController.getExercises);
router.get('/exercises/filters', WorkoutController.getExerciseFilters);
router.post('/exercises/refresh', authorize('owner'), WorkoutController.refreshExercises);
router.get('/exercises/:id', WorkoutController.getExerciseDetail);

// Workout sessions
router.get('/sessions', WorkoutController.getSessions);
router.get('/sessions/:id', WorkoutController.getSession);
router.post('/sessions', requireWritableMembership, validate(createSessionSchema), WorkoutController.createSession);
router.patch('/sessions/:id', requireWritableMembership, validate(updateSessionSchema), WorkoutController.updateSession);
router.post('/sessions/:id/photos', requireWritableMembership, photoUploadRateLimit, photoUpload.array('photos', 4), WorkoutController.uploadSessionPhotos);
router.delete('/sessions/:id', requireWritableMembership, WorkoutController.deleteSession);

// Progress
router.get('/progress/:exerciseId', WorkoutController.getProgress);

// Saved exercises
router.get('/saved', WorkoutController.getSavedExercises);
router.post('/saved', requireWritableMembership, validate(saveExerciseSchema), WorkoutController.saveExercise);
router.delete('/saved/:exerciseId', requireWritableMembership, WorkoutController.unsaveExercise);

// Playlists
router.get('/playlists', WorkoutController.getPlaylists);
router.post('/playlists', requireWritableMembership, validate(createPlaylistSchema), WorkoutController.createPlaylist);
router.patch('/playlists/:id', requireWritableMembership, validate(updatePlaylistSchema), WorkoutController.updatePlaylist);
router.delete('/playlists/:id', requireWritableMembership, WorkoutController.deletePlaylist);
router.post('/playlists/:id/exercises', requireWritableMembership, validate(addPlaylistExercisesSchema), WorkoutController.addPlaylistExercises);
router.delete('/playlists/:id/exercises/:exerciseId', requireWritableMembership, WorkoutController.removePlaylistExercise);

export default router;
