import supabase from '../config/supabase';
import {
    getBodyParts,
    getEquipmentList,
    getExerciseById,
    getMuscleList,
    refreshExerciseCache,
    searchExercises,
} from './exercise-provider.service';

type ExerciseId = string | number;

type ExerciseQueryOptions = {
    search?: string;
    bodyPart?: string;
    muscle?: string;
    equipment?: string;
    limit?: number;
    offset?: number;
};

const getMemberId = async (userId: string): Promise<string> => {
    const { data } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (!data) throw new Error('Member not found');
    return data.id;
};

export const getExercises = async ({
    search = '',
    bodyPart,
    muscle,
    equipment,
    limit = 20,
    offset = 0,
}: ExerciseQueryOptions = {}) => {
    return searchExercises(search, limit, offset, { bodyPart, muscle, equipment });
};

export const getExerciseDetail = async (exerciseId: ExerciseId) => {
    return getExerciseById(exerciseId);
};

export const getExerciseFilters = async () => {
    const [bodyParts, muscles, equipments] = await Promise.all([
        getBodyParts(),
        getMuscleList(),
        getEquipmentList(),
    ]);
    return { bodyParts, muscles, equipments };
};

export const refreshExercises = async () => {
    return refreshExerciseCache();
};

export const getSessions = async (userId: string, limit = 20, offset = 0) => {
    const memberId = await getMemberId(userId);

    const { data, error } = await supabase
        .from('workout_sessions')
        .select('*, workout_sets(*)')
        .eq('member_id', memberId)
        .order('date', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return data;
};

export const getSession = async (userId: string, sessionId: string) => {
    const memberId = await getMemberId(userId);

    const { data, error } = await supabase
        .from('workout_sessions')
        .select('*, workout_sets(*)')
        .eq('id', sessionId)
        .eq('member_id', memberId)
        .single();

    if (error || !data) throw new Error('Session not found');
    return data;
};

export const createSession = async (userId: string, body: any) => {
    const memberId = await getMemberId(userId);

    const { data: session, error: sessionErr } = await supabase
        .from('workout_sessions')
        .insert({
            member_id: memberId,
            date: body.date,
            name: body.name || null,
            notes: body.notes || null,
            duration_min: body.duration_min || null,
        })
        .select()
        .single();

    if (sessionErr || !session) throw new Error(sessionErr?.message || 'Failed to create session');

    const sets = body.sets.map((set: any) => ({
        session_id: session.id,
        exercise_id: set.exercise_id,
        exercise_name: set.exercise_name,
        set_number: set.set_number,
        reps: set.reps ?? null,
        weight_kg: set.weight_kg ?? null,
        notes: set.notes || null,
    }));

    const { error: setsErr } = await supabase.from('workout_sets').insert(sets);
    if (setsErr) throw new Error(setsErr.message);

    return { ...session, workout_sets: sets };
};

export const updateSession = async (userId: string, sessionId: string, body: any) => {
    const memberId = await getMemberId(userId);

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.duration_min !== undefined) update.duration_min = body.duration_min;

    const { data, error } = await supabase
        .from('workout_sessions')
        .update(update)
        .eq('id', sessionId)
        .eq('member_id', memberId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

const PHOTO_BUCKET = 'workout-photos';
const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PHOTOS_PER_SESSION = 8;

const extFor = (mime: string): string => {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    return 'bin';
};

export const uploadSessionPhotos = async (
    userId: string,
    sessionId: string,
    files: Array<{ buffer: Buffer; mimetype: string; size: number }>,
): Promise<string[]> => {
    const memberId = await getMemberId(userId);

    // Verify the session belongs to this member and fetch existing urls
    const { data: session, error: fetchErr } = await supabase
        .from('workout_sessions')
        .select('id, image_urls')
        .eq('id', sessionId)
        .eq('member_id', memberId)
        .single();

    if (fetchErr || !session) throw new Error('Session not found');

    const existing: string[] = Array.isArray((session as any).image_urls) ? (session as any).image_urls : [];
    const remainingSlots = MAX_PHOTOS_PER_SESSION - existing.length;
    if (remainingSlots <= 0) {
        throw new Error(`Session already has the maximum of ${MAX_PHOTOS_PER_SESSION} photos`);
    }

    const accepted = files.slice(0, remainingSlots);
    const newUrls: string[] = [];

    for (const file of accepted) {
        if (!ALLOWED_PHOTO_MIME.has(file.mimetype)) {
            throw new Error(`Unsupported file type: ${file.mimetype}`);
        }
        if (file.size > MAX_PHOTO_SIZE) {
            throw new Error('File exceeds the 10 MB limit');
        }

        const ext = extFor(file.mimetype);
        const random = Math.random().toString(36).slice(2, 10);
        const path = `${userId}/${sessionId}/${Date.now()}-${random}.${ext}`;

        const { error: uploadErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });
        if (uploadErr) throw new Error(uploadErr.message);

        const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        newUrls.push(urlData.publicUrl);
    }

    const merged = [...existing, ...newUrls];

    const { error: updateErr } = await supabase
        .from('workout_sessions')
        .update({ image_urls: merged })
        .eq('id', sessionId)
        .eq('member_id', memberId);
    if (updateErr) throw new Error(updateErr.message);

    return merged;
};

export const deleteSession = async (userId: string, sessionId: string) => {
    const memberId = await getMemberId(userId);

    const { error } = await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('member_id', memberId);

    if (error) throw new Error(error.message);
};

export const getProgress = async (userId: string, exerciseId: ExerciseId) => {
    const memberId = await getMemberId(userId);

    const { data, error } = await supabase
        .from('workout_sets')
        .select('reps, weight_kg, set_number, session_id, workout_sessions!inner(date, member_id)')
        .eq('exercise_id', exerciseId)
        .eq('workout_sessions.member_id', memberId)
        .order('workout_sessions(date)', { ascending: true } as any);

    if (error) throw new Error(error.message);

    const byDate: Record<string, { max_weight: number; total_volume: number; total_sets: number }> = {};
    for (const row of data || []) {
        const date = (row as any).workout_sessions?.date;
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { max_weight: 0, total_volume: 0, total_sets: 0 };
        const weight = Number(row.weight_kg) || 0;
        const reps = Number(row.reps) || 0;
        byDate[date].max_weight = Math.max(byDate[date].max_weight, weight);
        byDate[date].total_volume += weight * reps;
        byDate[date].total_sets++;
    }

    return Object.entries(byDate).map(([date, stats]) => ({ date, ...stats }));
};

// ── Saved exercises ───────────────────────────────────────────────────────────

export const getSavedExercises = async (userId: string) => {
    const memberId = await getMemberId(userId);

    const { data, error } = await supabase
        .from('saved_exercises')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

export const saveExercise = async (
    userId: string,
    body: { exercise_id: ExerciseId; exercise_name?: string; image_url?: string },
) => {
    const memberId = await getMemberId(userId);

    const { data, error } = await supabase
        .from('saved_exercises')
        .upsert(
            {
                member_id: memberId,
                exercise_id: String(body.exercise_id),
                exercise_name: body.exercise_name ?? null,
                image_url: body.image_url ?? null,
            },
            { onConflict: 'member_id,exercise_id' },
        )
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const unsaveExercise = async (userId: string, exerciseId: ExerciseId) => {
    const memberId = await getMemberId(userId);

    const { error } = await supabase
        .from('saved_exercises')
        .delete()
        .eq('member_id', memberId)
        .eq('exercise_id', String(exerciseId));

    if (error) throw new Error(error.message);
};

// ── Playlists ─────────────────────────────────────────────────────────────────

const ensureOwnedPlaylist = async (memberId: string, playlistId: string) => {
    const { data, error } = await supabase
        .from('playlists')
        .select('id')
        .eq('id', playlistId)
        .eq('member_id', memberId)
        .single();
    if (error || !data) throw new Error('Playlist not found');
    return data;
};

export const getPlaylists = async (userId: string) => {
    const memberId = await getMemberId(userId);

    const { data, error } = await supabase
        .from('playlists')
        .select('*, playlist_exercises(*)')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

export const createPlaylist = async (userId: string, body: { name: string; color?: string }) => {
    const memberId = await getMemberId(userId);

    const { data, error } = await supabase
        .from('playlists')
        .insert({ member_id: memberId, name: body.name, color: body.color ?? null })
        .select('*, playlist_exercises(*)')
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const updatePlaylist = async (
    userId: string,
    playlistId: string,
    body: { name?: string; color?: string },
) => {
    const memberId = await getMemberId(userId);
    await ensureOwnedPlaylist(memberId, playlistId);

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.color !== undefined) update.color = body.color;

    const { data, error } = await supabase
        .from('playlists')
        .update(update)
        .eq('id', playlistId)
        .eq('member_id', memberId)
        .select('*, playlist_exercises(*)')
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const deletePlaylist = async (userId: string, playlistId: string) => {
    const memberId = await getMemberId(userId);

    const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId)
        .eq('member_id', memberId);

    if (error) throw new Error(error.message);
};

export const addPlaylistExercises = async (
    userId: string,
    playlistId: string,
    exercises: Array<{ exercise_id: ExerciseId; exercise_name?: string; image_url?: string }>,
) => {
    const memberId = await getMemberId(userId);
    await ensureOwnedPlaylist(memberId, playlistId);

    const rows = exercises.map((e) => ({
        playlist_id: playlistId,
        exercise_id: String(e.exercise_id),
        exercise_name: e.exercise_name ?? null,
        image_url: e.image_url ?? null,
    }));

    const { data, error } = await supabase
        .from('playlist_exercises')
        .upsert(rows, { onConflict: 'playlist_id,exercise_id', ignoreDuplicates: true })
        .select();

    if (error) throw new Error(error.message);
    return data;
};

export const removePlaylistExercise = async (
    userId: string,
    playlistId: string,
    exerciseId: ExerciseId,
) => {
    const memberId = await getMemberId(userId);
    await ensureOwnedPlaylist(memberId, playlistId);

    const { error } = await supabase
        .from('playlist_exercises')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('exercise_id', String(exerciseId));

    if (error) throw new Error(error.message);
};
