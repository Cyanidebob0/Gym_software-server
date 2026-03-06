import { createClient } from '@supabase/supabase-js';
import { env } from './env';

const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

export default supabase;
