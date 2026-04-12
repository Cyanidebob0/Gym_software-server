import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error.middleware';

const app = express();
const authBootstrapPaths = new Set([
    '/api/v1/auth/me',
    '/api/v1/auth/sync',
    '/api/v1/auth/account-status',
]);

// Security
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));

// Rate limiting
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.nodeEnv === 'development' ? 1000 : 100,
        message: { success: false, message: 'Too many requests, please try again later.' },
        skip: (req) => authBootstrapPaths.has(req.path),
    })
);

// Logging
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
    res.json({ success: true, message: 'Server is running', env: env.nodeEnv });
});

// API routes
app.use('/api/v1', routes);

// 404 & error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
