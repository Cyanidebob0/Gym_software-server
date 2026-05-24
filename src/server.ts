import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import './config/env'; // validate env first
import app from './app';
import { env } from './config/env';
import logger from './utils/logger';
import { warmExerciseCache } from './services/exercise-provider.service';

app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
    // Eagerly load the exercise dataset so the first user request is instant.
    warmExerciseCache().catch((err) => {
        logger.warn(`Exercise cache warm-up failed: ${err instanceof Error ? err.message : err}`);
    });
});
