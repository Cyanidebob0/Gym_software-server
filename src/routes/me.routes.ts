import { NextFunction, Response, Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { selfRegisterMemberSchema, memberPaymentRequestSchema, updateProfileSchema } from '../validators/member.validator';
import * as MemberController from '../controllers/member.controller';
import { AuthRequest } from '../types/express.d';
import { requireWritableMembership } from '../middleware/membership-access.middleware';

const router = Router();

const idDocumentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('ID document must be a JPG, PNG, or WebP image'));
    },
}).single('id_document');

const uploadIdDocument = (req: AuthRequest, res: Response, next: NextFunction): void => {
    idDocumentUpload(req, res, (error) => {
        if (!error) return next();
        const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
            ? 'ID document must be 5 MB or smaller'
            : error.message || 'Unable to upload ID document';
        res.status(422).json({ success: false, message });
    });
};

// Member self-service routes — any authenticated user with member or owner role
router.use(authenticate, authorize('member', 'owner'));

// Registration flow
router.get('/status', MemberController.getMyStatus);
router.post('/register', uploadIdDocument, validate(selfRegisterMemberSchema), MemberController.selfRegister);
router.get('/plans', MemberController.getMyPlans);
router.get('/payment-request', MemberController.getMyPaymentRequest);
router.post('/payment-request', requireWritableMembership, validate(memberPaymentRequestSchema), MemberController.requestPayment);

// Existing self-service
router.get('/dashboard', MemberController.getMyDashboard);
router.get('/profile', MemberController.getMyProfile);
router.patch('/profile', requireWritableMembership, validate(updateProfileSchema), MemberController.updateMyProfile);
router.get('/attendance', MemberController.getMyAttendance);
router.get('/payments', MemberController.getMyPayments);
router.get('/broadcasts', MemberController.getMyBroadcasts);

// Self check-in/out
router.get('/today-checkin', MemberController.getTodayCheckIn);
router.post('/check-in', requireWritableMembership, MemberController.selfCheckIn);
router.post('/check-out', requireWritableMembership, MemberController.selfCheckOut);

export default router;
