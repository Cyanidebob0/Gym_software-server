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
};

const STARTER_DATASET_PATH = path.resolve(__dirname, '..', '..', 'data', 'exercises.starter.json');

const loadStarterDataset = async (): Promise<RawExercise[]> => {
    try {
        const content = await fs.readFile(STARTER_DATASET_PATH, 'utf8');
        return JSON.parse(content) as RawExercise[];
    } catch {
        return [];
    }
};

let datasetPromise: Promise<NormalizedExercise[]> | null = null;
const detailCache = new Map<string, NormalizedExercise>();

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

const getCandidateDatasetPaths = () => {
    if (path.isAbsolute(env.exerciseDatasetPath)) {
        return [env.exerciseDatasetPath];
    }

    return [
        path.resolve(process.cwd(), env.exerciseDatasetPath),
        path.resolve(__dirname, '..', '..', env.exerciseDatasetPath),
        path.resolve(__dirname, '..', '..', '..', env.exerciseDatasetPath),
    ];
};

const resolveDatasetPath = async () => {
    const candidates = getCandidateDatasetPaths();

    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // Try the next candidate path.
        }
    }

    throw new Error(`Exercise dataset not found. Checked: ${candidates.join(', ')}`);
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
        typeof rawExercise.imageUrl === 'string' ? rawExercise.imageUrl.trim() : '',
        typeof rawExercise.gifUrl === 'string' ? rawExercise.gifUrl.trim() : '',
        ...toStringArray(rawExercise.images),
    ].filter(Boolean);

    const imageUrl = imageCandidates[0] ? resolveImageUrl(imageCandidates[0]) : null;

    const videoUrl =
        typeof rawExercise.videoUrl === 'string' && rawExercise.videoUrl.trim()
            ? rawExercise.videoUrl.trim()
            : null;

    return {
        id,
        name: typeof rawExercise.name === 'string' ? rawExercise.name.trim() : String(id),
        description: typeof rawExercise.description === 'string' ? rawExercise.description.trim() : undefined,
        category:
            typeof rawExercise.category === 'string' && rawExercise.category.trim()
                ? rawExercise.category.trim()
                : bodyParts[0] ?? 'General',
        muscles: targetMuscles.map((name, index) => ({
            id: `${id}-muscle-${index}`,
            name: toTitleCase(name),
        })),
        muscles_secondary: secondaryMuscles.map((name, index) => ({
            id: `${id}-secondary-${index}`,
            name: toTitleCase(name),
        })),
        images: imageUrl ? [{ id: `${id}-image-0`, url: imageUrl }] : [],
        equipment: equipment.map((name, index) => ({
            id: `${id}-equipment-${index}`,
            name: toTitleCase(name),
        })),
        instructions,
        overview: typeof rawExercise.overview === 'string' ? rawExercise.overview.trim() : undefined,
        video_url: videoUrl,
    };
};

const readLocalDataset = async () => {
    try {
        const datasetPath = await resolveDatasetPath();
        const fileContent = await fs.readFile(datasetPath, 'utf8');
        const parsed = JSON.parse(fileContent) as unknown;
        if (!Array.isArray(parsed)) {
            throw new Error('Exercise dataset must be a JSON array');
        }
        return parsed as RawExercise[];
    } catch {
        return loadStarterDataset();
    }
};

const loadDataset = async () => {
    if (!datasetPromise) {
        datasetPromise = readLocalDataset().then((records) => {
            const normalized = records
                .map(normalizeExercise)
                .filter((exercise): exercise is NormalizedExercise => Boolean(exercise));

            detailCache.clear();
            for (const exercise of normalized) {
                detailCache.set(String(exercise.id), exercise);
            }

            return normalized;
        });
    }

    return datasetPromise;
};

export const searchExercises = async (search = '', limit = 20, offset = 0) => {
    const dataset = await loadDataset();
    const query = search.trim().toLowerCase();

    const filtered = dataset.filter((exercise) => {
        if (!query) return true;

        return [
            exercise.name,
            exercise.category,
            ...exercise.muscles.map((muscle) => muscle.name),
            ...(exercise.muscles_secondary ?? []).map((muscle) => muscle.name),
            ...exercise.equipment.map((item) => item.name),
        ]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(query));
    });

    return filtered.slice(offset, offset + limit);
};

export const getExerciseById = async (exerciseId: PrimitiveId) => {
    const dataset = await loadDataset();
    const match = detailCache.get(String(exerciseId))
        ?? dataset.find((exercise) => String(exercise.id) === String(exerciseId));

    if (!match) {
        throw new Error('Exercise not found');
    }

    return match;
};
