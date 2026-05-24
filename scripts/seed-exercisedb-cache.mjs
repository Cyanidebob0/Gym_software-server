// One-off script: pulls the full ExerciseDB dataset and writes the
// server/data/exercisedb-cache.json file the runtime reads on boot.
// Run with: node scripts/seed-exercisedb-cache.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.resolve(__dirname, '..', 'data', 'exercisedb-cache.json');
const BASE = 'https://oss.exercisedb.dev/api/v1';
const PAGE_SIZE = 25;
const CACHE_VERSION = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(cursor) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) params.set('after', cursor);
    const url = `${BASE}/exercises?${params}`;
    for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(url);
        if (res.ok) return res.json();
        if (res.status === 429 || res.status >= 500) {
            const backoff = 2000 * (attempt + 1);
            console.warn(`  ${res.status} on cursor=${cursor ?? 'start'} — sleeping ${backoff}ms`);
            await sleep(backoff);
            continue;
        }
        throw new Error(`HTTP ${res.status} on ${url}`);
    }
    throw new Error(`Gave up after retries on cursor=${cursor ?? 'start'}`);
}

// HEAD-check a media URL — keep exercises only when their GIF is actually served.
async function hasWorkingMedia(url) {
    if (!url) return false;
    try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok;
    } catch {
        return false;
    }
}

async function filterByMedia(records, concurrency = 20) {
    const kept = [];
    const dropped = [];
    let processed = 0;
    const queue = [...records];

    async function worker() {
        while (queue.length > 0) {
            const rec = queue.shift();
            const ok = await hasWorkingMedia(rec.gifUrl);
            if (ok) kept.push(rec); else dropped.push(rec);
            processed++;
            if (processed % 100 === 0) {
                process.stdout.write(`  probed ${processed}/${records.length} (${kept.length} ok, ${dropped.length} broken)\n`);
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    return { kept, dropped };
}

async function main() {
    const records = [];
    const seen = new Set();
    let cursor = null;
    let expectedTotal = null;

    console.log('Step 1/2: Fetching exercise list from ExerciseDB...');
    for (let page = 0; page < 200; page++) {
        const payload = await fetchPage(cursor);
        if (expectedTotal == null && typeof payload?.meta?.total === 'number') {
            expectedTotal = payload.meta.total;
        }
        const items = Array.isArray(payload?.data) ? payload.data : [];
        let added = 0;
        for (const item of items) {
            const id = String(item.exerciseId ?? item.id ?? '');
            if (id && !seen.has(id)) {
                seen.add(id);
                records.push(item);
                added++;
            }
        }
        process.stdout.write(`  page ${page + 1}: +${added} (total ${records.length}${expectedTotal ? `/${expectedTotal}` : ''})\n`);
        const nextCursor = payload?.meta?.nextCursor ?? null;
        const hasNext = payload?.meta?.hasNextPage ?? Boolean(nextCursor);
        if (!hasNext || !nextCursor || nextCursor === cursor || added === 0) break;
        cursor = nextCursor;
        await sleep(150);
    }

    console.log(`\nStep 2/2: Probing ${records.length} GIF URLs (drops any that 404)...`);
    const { kept, dropped } = await filterByMedia(records);
    console.log(`  done: ${kept.length} kept, ${dropped.length} dropped (${(dropped.length / records.length * 100).toFixed(1)}% broken)`);

    const envelope = {
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        expectedTotal: kept.length, // probed total is the real working total
        records: kept,
    };
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    const tmp = `${CACHE_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(envelope), 'utf8');
    await fs.rename(tmp, CACHE_PATH);
    console.log(`\nWrote ${kept.length} exercises with working media to ${CACHE_PATH}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
