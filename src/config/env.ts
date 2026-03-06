import dotenv from 'dotenv';
dotenv.config();

const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'CLIENT_URL',
];

required.forEach((key) => {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
});

export const env = {
    port: parseInt(process.env.PORT ?? '5000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    clientUrl: process.env.CLIENT_URL as string,
    supabaseUrl: process.env.SUPABASE_URL as string,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY as string,
};
