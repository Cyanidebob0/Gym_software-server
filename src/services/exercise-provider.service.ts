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

const EXERCISEDB_BASE = 'https://oss.exercisedb.dev/api/v1';
const PAGE_SIZE = 25; // OSS endpoint caps results at 25 per page
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 200; // safety cap (covers ~5000 exercises against the 1500-item dataset)
const STARTER_DATASET_PATH = path.resolve(__dirname, '..', '..', 'data', 'exercises.starter.json');
const CACHE_FILE_PATH = path.resolve(__dirname, '..', '..', 'data', 'exercisedb-cache.json');
const CACHE_VERSION = 1;
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

        // Up to 3 attempts per page; back off on 429/5xx so a rate-limit blip
        // doesn't wipe the whole fetch. If we still fail, return what we have.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetchWithTimeout(url);
                if (res.ok) {
                    payload = (await res.json()) as Payload;
                    break;
                }
                if (res.status === 429 || res.status >= 500) {
                    await sleep(1000 * (attempt + 1));
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
            console.warn(`[exercise-provider] gave up on page ${page} after retries; keeping ${collected.length} exercises so far`);
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

const probeMediaConcurrency = 20;

const filterRecordsWithWorkingMedia = async (records: RawExercise[]): Promise<RawExercise[]> => {
    const kept: RawExercise[] = [];
    const queue = [...records];

    const worker = async () => {
        while (queue.length > 0) {
            const rec = queue.shift();
            if (!rec) break;
            const url = typeof rec.gifUrl === 'string' ? rec.gifUrl : '';
            if (!url) continue;
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.ok) kept.push(rec);
            } catch {
                // skip
            }
        }
    };

    await Promise.all(Array.from({ length: probeMediaConcurrency }, worker));
    return kept;
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

    // Drop exercises whose CDN GIF actually 404s — about 12% of the free
    // dataset has missing media and we don't want blank cards.
    const cleanRecords = await filterRecordsWithWorkingMedia(result.records);

    await writeCacheFile({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        expectedTotal: cleanRecords.length,
        records: cleanRecords,
    });
    // eslint-disable-next-line no-console
    console.log(`[exercise-provider] fetched ${result.records.length} exercises, kept ${cleanRecords.length} with working media; cached to disk`);
    return cleanRecords;
};

const buildDataset = async (forceRefresh = false): Promise<NormalizedExercise[]> => {
    let records: RawExercise[] = [];

    if (!forceRefresh) {
        const cached = await readCacheFile();
        if (cached && isCacheFresh(cached) && cached.records.length > 0) {
            // eslint-disable-next-line no-console
            console.log(`[exercise-provider] loaded ${cached.records.length} exercises from disk cache (age: ${Math.floor((Date.now() - cached.fetchedAt) / (60 * 60 * 1000))}h)`);
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
        const target = filters.muscle.toLowerCase();
        const hit = exercise.muscles.some((m) => m.name.toLowerCase() === target)
            || (exercise.muscles_secondary ?? []).some((m) => m.name.toLowerCase() === target);
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

export const getEquipmentList = async () => {
    const dataset = await loadDataset();
    return dedupeSorted(dataset.flatMap((e) => e.equipment.map((eq) => eq.name)));
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
