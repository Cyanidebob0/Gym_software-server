import './config/env'; // validate env first
import app from './app';
import { env } from './config/env';
import logger from './utils/logger';

app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
});
