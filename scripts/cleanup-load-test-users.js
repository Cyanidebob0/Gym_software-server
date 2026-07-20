const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const manifestPath = path.resolve(__dirname, '..', '..', '.load-test-data', 'auth-users.json');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const main = async () => {
    if (!fs.existsSync(manifestPath)) {
        console.log(JSON.stringify({ deleted: 0, message: 'No load-test manifest found' }));
        return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const ids = manifest.users.map((user) => user.id);

    for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const { error: memberError } = await supabase.from('members').delete().in('user_id', batch);
        if (memberError) throw new Error(memberError.message);
        const { error: userError } = await supabase.from('users').delete().in('id', batch);
        if (userError) throw new Error(userError.message);
    }

    let cursor = 0;
    let deleted = 0;
    const workers = Array.from({ length: 8 }, async () => {
        while (cursor < ids.length) {
            const id = ids[cursor++];
            const { error } = await supabase.auth.admin.deleteUser(id);
            if (error && !/not found/i.test(error.message)) throw new Error(error.message);
            deleted++;
        }
    });
    await Promise.all(workers);
    fs.rmSync(manifestPath, { force: true });
    console.log(JSON.stringify({ deleted }));
};

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
