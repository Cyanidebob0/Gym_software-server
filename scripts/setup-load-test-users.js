const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const targetCount = Math.max(1, Math.min(Number(process.env.LOAD_TEST_USER_COUNT) || 200, 500));
const dataDir = path.resolve(__dirname, '..', '..', '.load-test-data');
const manifestPath = path.join(dataDir, 'auth-users.json');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

fs.mkdirSync(dataDir, { recursive: true });

const existingManifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : null;
const manifest = existingManifest || {
    runId: `szload-${Date.now().toString(36)}`,
    password: `Lt!${crypto.randomBytes(18).toString('base64url')}9a`,
    users: [],
};

const saveManifest = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const createFixture = async (index, plan) => {
    const ordinal = String(index + 1).padStart(4, '0');
    const email = `${manifest.runId}-${ordinal}@example.com`;
    const name = `Load Test Member ${ordinal}`;
    const phone = `9${String(index + 1).padStart(9, '0')}`;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: manifest.password,
        email_confirm: true,
        user_metadata: { name },
    });
    if (authError || !authData.user) throw new Error(authError?.message || `Could not create ${email}`);

    const userId = authData.user.id;
    const { error: userError } = await supabase.from('users').upsert({
        id: userId,
        email,
        name,
        phone,
        role: 'member',
    });
    if (userError) throw new Error(userError.message);

    const { error: memberError } = await supabase.from('members').insert({
        user_id: userId,
        name,
        phone,
        email,
        address: 'Load testing fixture - safe to delete',
        gender: 'other',
        plan_id: plan.id,
        status: 'active',
        access_state: 'normal',
        join_date: '2026-01-01',
        expiry_date: '2030-12-31',
    });
    if (memberError) throw new Error(memberError.message);

    manifest.users.push({ id: userId, email });
    saveManifest();
};

const main = async () => {
    const { data: plans, error } = await supabase
        .from('plans')
        .select('id')
        .eq('is_active', true)
        .limit(1);
    if (error || !plans?.[0]) throw new Error(error?.message || 'No active plan available');

    let nextIndex = manifest.users.length;
    const workers = Array.from({ length: 5 }, async () => {
        while (nextIndex < targetCount) {
            const index = nextIndex++;
            await createFixture(index, plans[0]);
        }
    });
    await Promise.all(workers);
    saveManifest();
    console.log(JSON.stringify({ created: manifest.users.length, target: targetCount, manifestPath }));
};

main().catch((error) => {
    saveManifest();
    console.error(error.message);
    process.exit(1);
});
