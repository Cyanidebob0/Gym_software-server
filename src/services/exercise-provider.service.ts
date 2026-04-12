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

const starterDataset: RawExercise[] = [
    {
        id: 'barbell-back-squat',
        name: 'Barbell Back Squat',
        category: 'Strength',
        bodyParts: ['Legs'],
        targetMuscles: ['Quadriceps', 'Glutes'],
        secondaryMuscles: ['Hamstrings', 'Core'],
        equipments: ['Barbell', 'Squat Rack'],
        instructions: [
            'Set the bar across your upper back and brace your core.',
            'Sit down and back until the hips drop below knee level if mobility allows.',
            'Drive through the mid-foot and stand up while keeping the chest tall.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'barbell-bench-press',
        name: 'Barbell Bench Press',
        category: 'Strength',
        bodyParts: ['Chest'],
        targetMuscles: ['Pectorals'],
        secondaryMuscles: ['Triceps', 'Front Delts'],
        equipments: ['Barbell', 'Bench'],
        instructions: [
            'Set your shoulders back and keep both feet planted.',
            'Lower the bar to the mid chest with control.',
            'Press the bar upward while maintaining a stable upper back.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'barbell-deadlift',
        name: 'Barbell Deadlift',
        category: 'Strength',
        bodyParts: ['Posterior Chain'],
        targetMuscles: ['Glutes', 'Hamstrings'],
        secondaryMuscles: ['Lats', 'Lower Back', 'Forearms'],
        equipments: ['Barbell'],
        instructions: [
            'Grip the bar just outside the legs and pull the slack out of it.',
            'Push the floor away and keep the bar close to the shins.',
            'Stand tall at the top without leaning back aggressively.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'pull-up',
        name: 'Pull-Up',
        category: 'Bodyweight',
        bodyParts: ['Back'],
        targetMuscles: ['Lats'],
        secondaryMuscles: ['Biceps', 'Mid Back'],
        equipments: ['Pull-Up Bar'],
        instructions: [
            'Start from a dead hang with shoulders packed.',
            'Pull your elbows toward your ribs until the chin clears the bar.',
            'Lower under control to full extension.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1599058917765-a780eda07a3e?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'dumbbell-romanian-deadlift',
        name: 'Dumbbell Romanian Deadlift',
        category: 'Strength',
        bodyParts: ['Posterior Chain'],
        targetMuscles: ['Hamstrings'],
        secondaryMuscles: ['Glutes', 'Lower Back'],
        equipments: ['Dumbbells'],
        instructions: [
            'Hold the dumbbells by your sides and soften the knees slightly.',
            'Hinge at the hips and lower the weights while keeping the spine neutral.',
            'Drive the hips forward to return to standing.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'walking-lunge',
        name: 'Walking Lunge',
        category: 'Functional',
        bodyParts: ['Legs'],
        targetMuscles: ['Quadriceps', 'Glutes'],
        secondaryMuscles: ['Hamstrings', 'Core'],
        equipments: ['Bodyweight'],
        instructions: [
            'Step forward into a lunge and lower the back knee toward the floor.',
            'Keep the torso upright and the front knee tracking over the foot.',
            'Drive through the front leg and continue into the next step.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1434682881908-b43d0467b798?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'lat-pulldown',
        name: 'Lat Pulldown',
        category: 'Machine',
        bodyParts: ['Back'],
        targetMuscles: ['Lats'],
        secondaryMuscles: ['Biceps', 'Rear Delts'],
        equipments: ['Cable Machine'],
        instructions: [
            'Set the thigh pad, take a wide grip, and sit tall.',
            'Pull the bar toward the upper chest while keeping elbows tucked slightly forward.',
            'Return the bar overhead with full control.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'seated-cable-row',
        name: 'Seated Cable Row',
        category: 'Machine',
        bodyParts: ['Back'],
        targetMuscles: ['Mid Back'],
        secondaryMuscles: ['Lats', 'Biceps'],
        equipments: ['Cable Machine'],
        instructions: [
            'Sit tall with the chest lifted and arms extended.',
            'Pull the handle to the lower ribs and squeeze the shoulder blades together.',
            'Extend the arms forward without rounding through the lower back.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'dumbbell-shoulder-press',
        name: 'Dumbbell Shoulder Press',
        category: 'Strength',
        bodyParts: ['Shoulders'],
        targetMuscles: ['Deltoids'],
        secondaryMuscles: ['Triceps', 'Upper Chest'],
        equipments: ['Dumbbells'],
        instructions: [
            'Hold the dumbbells at shoulder height with wrists stacked.',
            'Press overhead until the arms lock out.',
            'Lower back to shoulder level with control.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1517344368193-41552b6ad3f5?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'dumbbell-biceps-curl',
        name: 'Dumbbell Biceps Curl',
        category: 'Isolation',
        bodyParts: ['Arms'],
        targetMuscles: ['Biceps'],
        secondaryMuscles: ['Forearms'],
        equipments: ['Dumbbells'],
        instructions: [
            'Stand tall with elbows pinned near the torso.',
            'Curl the dumbbells toward the shoulders without swinging.',
            'Lower slowly to full extension.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'triceps-pushdown',
        name: 'Triceps Pushdown',
        category: 'Isolation',
        bodyParts: ['Arms'],
        targetMuscles: ['Triceps'],
        secondaryMuscles: ['Forearms'],
        equipments: ['Cable Machine'],
        instructions: [
            'Set the cable high and keep elbows close to the torso.',
            'Press the handle down until the arms are fully extended.',
            'Return to the start without letting the elbows drift forward.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=900&q=80',
    },
    {
        id: 'leg-press',
        name: 'Leg Press',
        category: 'Machine',
        bodyParts: ['Legs'],
        targetMuscles: ['Quadriceps'],
        secondaryMuscles: ['Glutes', 'Hamstrings'],
        equipments: ['Leg Press Machine'],
        instructions: [
            'Place the feet shoulder-width apart on the platform.',
            'Lower the sled until the knees are deeply bent without lifting the hips.',
            'Press the platform away without locking the knees violently.',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=900&q=80',
    },
];

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
        return starterDataset;
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
