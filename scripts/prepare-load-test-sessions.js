const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const requestedCount = Math.max(1, Math.min(Number(process.env.LOAD_TEST_SESSION_COUNT) || 200, 500));
const manifestPath = path.resolve(__dirname, '..', '..', '.load-test-data', 'auth-users.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const createSession = async (user) => {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
        throw new Error(linkError?.message || `Could not generate session link for ${user.email}`);
    }

    const { data, error } = await anon.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
    });
    if (error || !data.session) throw new Error(error?.message || `Could not verify ${user.email}`);
    user.accessToken = data.session.access_token;
};

const main = async () => {
    const targets = manifest.users.slice(0, requestedCount);
    let cursor = 0;
    const workers = Array.from({ length: 4 }, async () => {
        while (cursor < targets.length) {
            const user = targets[cursor++];
            if (!user.accessToken) {
                await createSession(user);
                save();
            }
        }
    });
    await Promise.all(workers);
    save();
    console.log(JSON.stringify({ sessionsPrepared: targets.filter((user) => user.accessToken).length }));
};

main().catch((error) => {
    save();
    console.error(error.message);
    process.exit(1);
});
