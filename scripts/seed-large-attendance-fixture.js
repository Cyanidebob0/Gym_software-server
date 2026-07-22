const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_ROW_COUNT = 100_000;
const BATCH_SIZE = 1_000;

function* attendanceBatches(memberId, rowCount = DEFAULT_ROW_COUNT, batchSize = BATCH_SIZE) {
    const baseDay = Date.UTC(2026, 6, 22);
    for (let start = 0; start < rowCount; start += batchSize) {
        const size = Math.min(batchSize, rowCount - start);
        yield Array.from({ length: size }, (_, offset) => {
            const sequence = start + offset;
            const date = new Date(baseDay - Math.floor(sequence / 25) * 86_400_000)
                .toISOString()
                .slice(0, 10);
            const minute = sequence % (24 * 60);
            const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
            const minuteText = String(minute % 60).padStart(2, '0');
            return {
                member_id: memberId,
                date,
                check_in: `${hourText}:${minuteText}:00`,
                check_out: `${hourText}:${minuteText}:30`,
            };
        });
    }
}

const main = async () => {
    const rowCount = Math.max(DEFAULT_ROW_COUNT, Number(process.env.LARGE_ATTENDANCE_ROW_COUNT) || 0);
    const manifestPath = path.resolve(__dirname, '..', '..', '.load-test-data', 'auth-users.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error('Run node scripts/setup-load-test-users.js first (auth-users.json is missing)');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const fixtureUserId = manifest.users?.[0]?.id;
    if (!fixtureUserId) throw new Error('The load-test manifest has no users');

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', fixtureUserId)
        .single();
    if (memberError || !member) throw new Error(memberError?.message || 'Fixture member not found');

    let inserted = 0;
    for (const rows of attendanceBatches(member.id, rowCount)) {
        const { error } = await supabase.from('attendance').insert(rows);
        if (error) throw new Error(`Stopped after ${inserted} rows: ${error.message}`);
        inserted += rows.length;
        if (inserted % 10_000 === 0) console.log(`Inserted ${inserted}/${rowCount}`);
    }
    console.log(JSON.stringify({ memberId: member.id, inserted }));
};

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = { attendanceBatches, DEFAULT_ROW_COUNT, BATCH_SIZE };
