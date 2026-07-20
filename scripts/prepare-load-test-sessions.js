const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const requestedCount = Math.max(1, Math.min(Number(process.env.LOAD_TEST_SESSION_COUNT) || 200, 500));
const manifestPath = path.resolve(__dirname, '..', '..', '.load-test-data', 'auth-users.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const createSession = async (user) => {
    for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error } = await anon.auth.signInWithPassword({
            email: user.email,
            password: manifest.password,
        });
        if (!error && data.session) {
            user.accessToken = data.session.access_token;
            return;
        }
        if (!/rate limit|too many/i.test(error?.message || '') || attempt === 5) {
            throw new Error(error?.message || `Could not sign in ${user.email}`);
        }
        await wait(5_000 * (attempt + 1));
    }
};

const main = async () => {
    const targets = manifest.users.slice(0, requestedCount);
    let cursor = 0;
    const workers = Array.from({ length: 1 }, async () => {
        while (cursor < targets.length) {
            const user = targets[cursor++];
            if (!user.accessToken) {
                await createSession(user);
                save();
                await wait(750);
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
