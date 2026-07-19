import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error.middleware';

const app = express();

// Security
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(compression({ threshold: 1024 }));

// Rate limiting
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.nodeEnv === 'development' ? 5000 : 300,
        message: { success: false, message: 'Too many requests, please try again later.' },
    })
);

// Logging
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authenticated responses must not be shared by intermediary caches. Expensive
// read paths use safe in-process caches and endpoint-specific browser caching.
app.use('/api/v1', (req, res, next) => {
    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'private, no-cache');
    } else {
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
});

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
