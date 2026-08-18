import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';

type PrimitiveId = string | number;
type RawExercise = Record<string, any>;

type NormalizedExercise = {
    id: PrimitiveId;
    name: string;
    description?: string;
    category?: string;
    muscles: Array<{ id: string; name: string; image_url?: string }>;
    muscles_secondary?: Array<{ id: string; name: string; image_url?: string }>;
    images: Array<{ id: string; url: string }>;
    equipment: Array<{ id: string; name: string }>;
    instructions?: string[];
    overview?: string;
    video_url?: string | null;
    body_parts?: string[];
};

type ExerciseFilters = {
    bodyPart?: string;
    muscle?: string;
    equipment?: string;
};

// Beginner-facing groups accepted by the exercise API. The dataset uses
// anatomical names (for example, "Pectorals" and "Delts"), so each friendly
// group expands to the relevant primary target muscles in the cache.
const MUSCLE_GROUPS: Record<string, string[]> = {
    cardio: ['cardiovascular system'],
    chest: ['pectorals', 'serratus anterior'],
    back: ['lats', 'spine'],
    biceps: ['biceps'],
    triceps: ['triceps'],
    quadriceps: ['quads'],
    hamstrings: ['hamstrings'],
    shoulders: ['delts'],
    hips: ['glutes', 'abductors', 'adductors'],
    waist: ['abs'],
    'upper back': ['traps', 'upper back'],
    calves: ['calves'],
    forearms: ['forearms'],
    neck: ['levator scapulae'],
};

const MUSCLE_GROUP_LABELS = [
    'Cardio',
    'Chest',
    'Back',
    'Biceps',
    'Triceps',
    'Quadriceps',
    'Hamstrings',
    'Shoulders',
    'Hips',
    'Waist',
    'Upper Back',
    'Calves',
    'Forearms',
    'Neck',
];

const EXERCISEDB_BASE = 'https://oss.exercisedb.dev/api/v1';
const PAGE_SIZE = 25; // OSS endpoint caps results at 25 per page
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 200; // safety cap (covers ~5000 exercises against the 1500-item dataset)
const STARTER_DATASET_PATH = path.resolve(__dirname, '..', '..', 'data', 'exercises.starter.json');
const CACHE_FILE_PATH = path.resolve(__dirname, '..', '..', 'data', 'exercisedb-cache.json');
// Version 3 rebuilds caches with reliable ranged-GET media validation. The
// previous HEAD-based check dropped good records, while no check left known
// 404 GIFs visible as empty black cards.
const CACHE_VERSION = 3;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for complete fetches
const PARTIAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for partial fetches
const COMPLETE_FRACTION = 0.9; // ≥ 90% of expected total counts as "complete"

const toTitleCase = (value: string) =>
    value
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                const candidate = record.name ?? record.name_en ?? record.label ?? record.value;
                if (typeof candidate === 'string') return candidate.trim();
            }
            return '';
        })
        .filter(Boolean);
};

const resolveImageUrl = (value: string) => {
    if (/^https?:\/\//i.test(value)) return value;
    return `${env.exerciseDatasetImageBaseUrl.replace(/\/+$/, '')}/${value.replace(/^\/+/, '')}`;
};

const normalizeExercise = (rawExercise: RawExercise): NormalizedExercise | null => {
    const id = rawExercise.id ?? rawExercise.exerciseId ?? rawExercise.slug ?? rawExercise.name;
    if (typeof id !== 'string' && typeof id !== 'number') return null;

    const targetMuscles = toStringArray(
        rawExercise.targetMuscles ?? rawExercise.primaryMuscles ?? rawExercise.target ?? rawExercise.muscles
    );
    const secondaryMuscles = toStringArray(
        rawExercise.secondaryMuscles ?? rawExercise.secondary_muscles ?? rawExercise.secondary
    );
    const equipment = toStringArray(rawExercise.equipments ?? rawExercise.equipment ?? rawExercise.equipment_list);
    const instructions = toStringArray(rawExercise.instructions ?? rawExercise.steps);
    const bodyParts = toStringArray(rawExercise.bodyParts ?? rawExercise.bodyparts ?? rawExercise.bodyPart);

    const imageCandidates = [
        typeof rawExercise.gifUrl === 'string' ? rawExercise.gifUrl.trim() : '',
        typeof rawExercise.imageUrl === 'string' ? rawExercise.imageUrl.trim() : '',
        ...toStringArray(rawExercise.images),
    ].filter(Boolean);

    const imageUrl = imageCandidates[0] ? resolveImageUrl(imageCandidates[0]) : null;

    const videoUrl =
        typeof rawExercise.videoUrl === 'string' && rawExercise.videoUrl.trim()
            ? rawExercise.videoUrl.trim()
            : null;

    const idStr = String(id);

    return {
        id,
        name: typeof rawExercise.name === 'string' ? toTitleCase(rawExercise.name.trim()) : String(id),
        description: typeof rawExercise.description === 'string' ? rawExercise.description.trim() : undefined,
        category:
            typeof rawExercise.category === 'string' && rawExercise.category.trim()
                ? toTitleCase(rawExercise.category.trim())
                : bodyParts[0]
                    ? toTitleCase(bodyParts[0])
                    : 'General',
        muscles: targetMuscles.map((name, index) => ({
            id: `${idStr}-muscle-${index}`,
            name: toTitleCase(name),
        })),
        muscles_secondary: secondaryMuscles.map((name, index) => ({
            id: `${idStr}-secondary-${index}`,
            name: toTitleCase(name),
        })),
        images: imageUrl ? [{ id: `${idStr}-image-0`, url: imageUrl }] : [],
        equipment: equipment.map((name, index) => ({
            id: `${idStr}-equipment-${index}`,
            name: toTitleCase(name),
        })),
        instructions,
        overview: typeof rawExercise.overview === 'string' ? rawExercise.overview.trim() : undefined,
        video_url: videoUrl,
        body_parts: bodyParts.map(toTitleCase),
    };
};

// ── ExerciseDB fetch ──────────────────────────────────────────────────────────

const fetchWithTimeout = async (url: string): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type FetchResult = {
    records: RawExercise[];
    expectedTotal: number | null;
};

const fetchAllExercisesFromApi = async (): Promise<FetchResult> => {
    const collected: RawExercise[] = [];
    const seenIds = new Set<string>();
    let cursor: string | null = null;
    let expectedTotal: number | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (cursor) params.set('after', cursor);

        const url = `${EXERCISEDB_BASE}/exercises?${params}`;

        type Payload = {
            data?: RawExercise[];
            meta?: { hasNextPage?: boolean; nextCursor?: string | null; total?: number };
        };
        let payload: Payload | null = null;

        // ExerciseDB rate-limits long pagination runs. Respect Retry-After and
        // use a longer exponential fallback so a normal 60-page refresh can
        // finish instead of stopping after the first 250 records.
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                const res = await fetchWithTimeout(url);
                if (res.ok) {
                    payload = (await res.json()) as Payload;
                    break;
                }
                if (res.status === 429 || res.status >= 500) {
                    const retryAfter = Number(res.headers.get('retry-after'));
                    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
                        ? retryAfter * 1000
                        : Math.min(30_000, 1000 * (2 ** attempt));
                    await sleep(delayMs);
                    continue;
                }
                // Other 4xx: don't retry
                break;
            } catch {
                await sleep(500 * (attempt + 1));
            }
        }

        if (!payload) {
            // eslint-disable-next-line no-console
            console.warn(`[exercise-provider] gave up on page ${page} after retries; fetched ${collected.length} exercises so far`);
            break;
        }

        if (typeof payload.meta?.total === 'number' && expectedTotal === null) {
            expectedTotal = payload.meta.total;
        }

        const items = Array.isArray(payload.data) ? payload.data : [];
        if (items.length === 0) break;

        let addedAny = false;
        for (const item of items) {
            const id = String(item.exerciseId ?? item.id ?? '');
            if (id && !seenIds.has(id)) {
                seenIds.add(id);
                collected.push(item);
                addedAny = true;
            }
        }
        if (!addedAny) break;

        const nextCursor = payload.meta?.nextCursor ?? null;
        const hasNext = payload.meta?.hasNextPage ?? Boolean(nextCursor);
        if (!hasNext || !nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
    }

    return { records: collected, expectedTotal };
};

// ── Persistent cache file ─────────────────────────────────────────────────────

type CacheEnvelope = {
    version: number;
    fetchedAt: number;
    expectedTotal: number | null;
    records: RawExercise[];
};

const readCacheFile = async (): Promise<CacheEnvelope | null> => {
    try {
        const content = await fs.readFile(CACHE_FILE_PATH, 'utf8');
        const parsed = JSON.parse(content) as Partial<CacheEnvelope>;
        if (
            parsed.version !== CACHE_VERSION ||
            typeof parsed.fetchedAt !== 'number' ||
            !Array.isArray(parsed.records)
        ) {
            return null;
        }
        return {
            version: parsed.version,
            fetchedAt: parsed.fetchedAt,
            expectedTotal: parsed.expectedTotal ?? null,
            records: parsed.records,
        };
    } catch {
        return null;
    }
};

const writeCacheFile = async (envelope: CacheEnvelope) => {
    try {
        await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
        // Write to a tmp file then rename — atomic on POSIX, near-atomic on Windows
        const tmp = `${CACHE_FILE_PATH}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(envelope), 'utf8');
        await fs.rename(tmp, CACHE_FILE_PATH);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[exercise-provider] failed to write cache file: ${(err as Error).message}`);
    }
};

const isCacheFresh = (envelope: CacheEnvelope): boolean => {
    const age = Date.now() - envelope.fetchedAt;
    const complete = envelope.expectedTotal === null
        || envelope.records.length >= Math.floor(envelope.expectedTotal * COMPLETE_FRACTION);
    const ttl = complete ? CACHE_TTL_MS : PARTIAL_CACHE_TTL_MS;
    return age >= 0 && age < ttl;
};

// ── Fallback dataset (local JSON) ─────────────────────────────────────────────

const getCandidateDatasetPaths = () => {
    if (path.isAbsolute(env.exerciseDatasetPath)) return [env.exerciseDatasetPath];
    return [
        path.resolve(process.cwd(), env.exerciseDatasetPath),
        path.resolve(__dirname, '..', '..', env.exerciseDatasetPath),
        path.resolve(__dirname, '..', '..', '..', env.exerciseDatasetPath),
    ];
};

const readLocalDataset = async (): Promise<RawExercise[]> => {
    for (const candidate of getCandidateDatasetPaths()) {
        try {
            const content = await fs.readFile(candidate, 'utf8');
            const parsed = JSON.parse(content) as unknown;
            if (Array.isArray(parsed)) return parsed as RawExercise[];
        } catch {
            // try next
        }
    }
    try {
        const content = await fs.readFile(STARTER_DATASET_PATH, 'utf8');
        const parsed = JSON.parse(content) as unknown;
        return Array.isArray(parsed) ? (parsed as RawExercise[]) : [];
    } catch {
        return [];
    }
};

// ── In-memory cache ───────────────────────────────────────────────────────────

let datasetPromise: Promise<NormalizedExercise[]> | null = null;
const detailCache = new Map<string, NormalizedExercise>();

// Reverse index from a dataset muscle name to the beginner groups that accept
// it, so the per-group equipment map costs a single pass over the dataset.
const MUSCLE_TO_GROUPS = (() => {
    const map = new Map<string, string[]>();
    for (const label of MUSCLE_GROUP_LABELS) {
        const key = label.toLowerCase();
        for (const muscle of MUSCLE_GROUPS[key] ?? [key]) {
            const groups = map.get(muscle) ?? [];
            groups.push(key);
            map.set(muscle, groups);
        }
    }
    return map;
})();

// Equipment that actually has at least one exercise per beginner muscle group,
// keyed by lowercased group label. Uses the same primary-target matching as
// matchesFilter so a chip is never offered that would return zero results.
let equipmentByGroupCache: Record<string, string[]> = {};

const buildEquipmentByGroup = (dataset: NormalizedExercise[]) => {
    const sets = new Map<string, Set<string>>();
    for (const exercise of dataset) {
        const groups = new Set<string>();
        for (const m of exercise.muscles) {
            for (const group of MUSCLE_TO_GROUPS.get(m.name.toLowerCase()) ?? []) {
                groups.add(group);
            }
        }
        for (const group of groups) {
            let set = sets.get(group);
            if (!set) {
                set = new Set<string>();
                sets.set(group, set);
            }
            for (const eq of exercise.equipment) set.add(eq.name);
        }
    }
    return Object.fromEntries([...sets].map(([group, set]) => [group, dedupeSorted(set)]));
};

const MEDIA_PROBE_CONCURRENCY = 12;

const hasUsableMedia = async (record: RawExercise): Promise<boolean> => {
    const url = typeof record.gifUrl === 'string' ? record.gifUrl.trim() : '';
    if (!url) return true; // Local/fallback records can use their `images` field.

    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            // A tiny ranged GET behaves like the browser/CDN path. HEAD is not
            // reliable on this CDN and was the reason valid exercises vanished.
            const response = await fetch(url, {
                method: 'GET',
                headers: { Range: 'bytes=0-1023' },
                signal: controller.signal,
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
                await response.body?.cancel();
                return contentType.startsWith('image/');
            }

            await response.body?.cancel();
            if (response.status === 408 || response.status === 429 || response.status >= 500) {
                await sleep(500 * (attempt + 1));
                continue;
            }

            // A stable client error such as 404/410 means the browser cannot
            // display this exercise either, so omit it from the catalogue.
            return false;
        } catch {
            await sleep(500 * (attempt + 1));
        } finally {
            clearTimeout(timeout);
        }
    }

    // Network failures are inconclusive. Keep the exercise and let the client
    // retry naturally instead of permanently shrinking the dataset.
    return true;
};

const filterRecordsWithUsableMedia = async (records: RawExercise[]): Promise<RawExercise[]> => {
    const results = new Array<boolean>(records.length).fill(true);
    let cursor = 0;

    const worker = async () => {
        while (cursor < records.length) {
            const index = cursor++;
            results[index] = await hasUsableMedia(records[index]);
        }
    };

    await Promise.all(Array.from({ length: MEDIA_PROBE_CONCURRENCY }, worker));
    return records.filter((_record, index) => results[index]);
};

const fetchFromApiAndCache = async (): Promise<RawExercise[]> => {
    let result: FetchResult = { records: [], expectedTotal: null };
    try {
        result = await fetchAllExercisesFromApi();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[exercise-provider] ExerciseDB fetch errored: ${(err as Error).message}`);
    }
    if (result.records.length === 0) return [];

    const expectedTotal = result.expectedTotal ?? result.records.length;
    const complete = result.records.length >= Math.floor(expectedTotal * COMPLETE_FRACTION);
    let recordsToUse = result.records;

    // If the API still cannot complete after its extended retries, prefer the
    // larger bundled dataset rather than shrinking the app to a partial page
    // run. Keep the upstream expected total so this cache receives the short
    // partial TTL and will be retried later.
    if (!complete) {
        const localRecords = await readLocalDataset();
        if (localRecords.length > recordsToUse.length) {
            recordsToUse = localRecords;
            // eslint-disable-next-line no-console
            console.warn(`[exercise-provider] API refresh was partial (${result.records.length}/${expectedTotal}); using ${localRecords.length} bundled exercises`);
        }
    }

    const recordsWithUsableMedia = await filterRecordsWithUsableMedia(recordsToUse);
    const removedMediaCount = recordsToUse.length - recordsWithUsableMedia.length;
    recordsToUse = recordsWithUsableMedia;
    if (removedMediaCount > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[exercise-provider] omitted ${removedMediaCount} exercises with broken media`);
    }

    // A fully paginated API fetch is complete after known-broken media is
    // removed. Partial API/fallback results retain the upstream total so they
    // continue using the short TTL and get retried later.
    const cacheExpectedTotal = complete ? recordsToUse.length : expectedTotal;

    await writeCacheFile({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        // Preserve the API's reported total so a partial fetch is never marked
        // as a complete cache. Image failures are handled by the client card's
        // fallback and must not remove valid exercise records.
        expectedTotal: cacheExpectedTotal,
        records: recordsToUse,
    });
    // eslint-disable-next-line no-console
    console.log(`[exercise-provider] cached ${recordsToUse.length} exercises`);
    return recordsToUse;
};

const buildDataset = async (forceRefresh = false): Promise<NormalizedExercise[]> => {
    let records: RawExercise[] = [];

    if (!forceRefresh) {
        const cached = await readCacheFile();
        if (cached && cached.records.length > 0) {
            const freshness = isCacheFresh(cached) ? 'fresh' : 'bundled';
            // eslint-disable-next-line no-console
            console.log(`[exercise-provider] loaded ${cached.records.length} exercises from ${freshness} disk cache (age: ${Math.floor((Date.now() - cached.fetchedAt) / (60 * 60 * 1000))}h)`);
            records = cached.records;
        }
    }

    if (records.length === 0) {
        records = await fetchFromApiAndCache();
    }

    if (records.length === 0) {
        // Last-resort: use whatever stale cache we still have on disk, even if expired
        const stale = await readCacheFile();
        if (stale && stale.records.length > 0) {
            // eslint-disable-next-line no-console
            console.warn(`[exercise-provider] using stale disk cache (${stale.records.length} exercises) since API and fresh cache are unavailable`);
            records = stale.records;
        } else {
            // eslint-disable-next-line no-console
            console.warn('[exercise-provider] No cache or API data available; falling back to bundled local JSON');
            records = await readLocalDataset();
        }
    }

    const normalized = records
        .map(normalizeExercise)
        .filter((exercise): exercise is NormalizedExercise => Boolean(exercise));

    detailCache.clear();
    for (const exercise of normalized) {
        detailCache.set(String(exercise.id), exercise);
    }
    equipmentByGroupCache = buildEquipmentByGroup(normalized);

    return normalized;
};

const loadDataset = async (): Promise<NormalizedExercise[]> => {
    if (!datasetPromise) {
        datasetPromise = buildDataset().catch((err) => {
            datasetPromise = null; // allow retry on next call
            throw err;
        });
    }
    return datasetPromise;
};

// ── Public API ────────────────────────────────────────────────────────────────

const matchesFilter = (exercise: NormalizedExercise, filters: ExerciseFilters) => {
    if (filters.bodyPart) {
        const target = filters.bodyPart.toLowerCase();
        const hit = (exercise.body_parts ?? []).some((p) => p.toLowerCase() === target)
            || exercise.category?.toLowerCase() === target;
        if (!hit) return false;
    }
    if (filters.muscle) {
        const target = filters.muscle.trim().toLowerCase();
        const acceptedMuscles = new Set(MUSCLE_GROUPS[target] ?? [target]);
        // Filtering is intentionally based on primary targets only. Including
        // secondary stabilizers makes unrelated compound exercises appear in
        // a group (for example, back exercises under Arms).
        const hit = exercise.muscles.some((m) => acceptedMuscles.has(m.name.toLowerCase()));
        if (!hit) return false;
    }
    if (filters.equipment) {
        const target = filters.equipment.toLowerCase();
        if (!exercise.equipment.some((e) => e.name.toLowerCase() === target)) return false;
    }
    return true;
};

export const searchExercises = async (
    search = '',
    limit = 20,
    offset = 0,
    filters: ExerciseFilters = {},
) => {
    const dataset = await loadDataset();
    const query = search.trim().toLowerCase();

    const filtered = dataset.filter((exercise) => {
        if (!matchesFilter(exercise, filters)) return false;
        if (!query) return true;

        return [
            exercise.name,
            exercise.category,
            ...exercise.muscles.map((m) => m.name),
            ...(exercise.muscles_secondary ?? []).map((m) => m.name),
            ...exercise.equipment.map((e) => e.name),
            ...(exercise.body_parts ?? []),
        ]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(query));
    });

    return {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
    };
};

export const getExerciseById = async (exerciseId: PrimitiveId) => {
    const dataset = await loadDataset();
    const match = detailCache.get(String(exerciseId))
        ?? dataset.find((exercise) => String(exercise.id) === String(exerciseId));
    if (!match) throw new Error('Exercise not found');
    return match;
};

const dedupeSorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

export const getBodyParts = async () => {
    const dataset = await loadDataset();
    return dedupeSorted(dataset.flatMap((e) => e.body_parts ?? []));
};

export const getMuscleList = async () => {
    const dataset = await loadDataset();
    return dedupeSorted(dataset.flatMap((e) => e.muscles.map((m) => m.name)));
};

export const getMuscleGroups = () => [...MUSCLE_GROUP_LABELS];

export const getEquipmentList = async () => {
    const dataset = await loadDataset();
    return dedupeSorted(dataset.flatMap((e) => e.equipment.map((eq) => eq.name)));
};

export const getEquipmentByMuscleGroup = async () => {
    await loadDataset();
    return equipmentByGroupCache;
};

export const warmExerciseCache = async () => {
    const dataset = await loadDataset();
    // eslint-disable-next-line no-console
    console.log(`[exercise-provider] cache warmed (${dataset.length} exercises)`);
};

export const refreshExerciseCache = async () => {
    // Build a fresh dataset bypassing the disk cache and replace the in-memory cache.
    datasetPromise = buildDataset(true).catch((err) => {
        datasetPromise = null;
        throw err;
    });
    const dataset = await datasetPromise;
    return { count: dataset.length };
};
