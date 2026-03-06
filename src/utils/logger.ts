import { env } from '../config/env';

const timestamp = () => new Date().toISOString();

const logger = {
    info: (...args: unknown[]) => {
        if (env.nodeEnv !== 'test') console.log('[INFO]', timestamp(), ...args);
    },
    warn: (...args: unknown[]) => {
        console.warn('[WARN]', timestamp(), ...args);
    },
    error: (...args: unknown[]) => {
        console.error('[ERROR]', timestamp(), ...args);
    },
};

export default logger;
