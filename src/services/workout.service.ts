import supabase from '../config/supabase';
import { getExerciseById, searchExercises } from './exercise-provider.service';

type ExerciseId = string | number;

const getMemberId = async (userId: string): Promise<string> => {
    const { data } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (!data) throw new Error('Member not found');
    return data.id;
};

export const getExercises = async (search?: string, _category?: string, limit = 20, offset = 0) => {
    if (!search || !search.trim()) {
        return [];
    }

    return searchExercises(search, limit, offset);
};

export const getExerciseDetail = async (exerciseId: ExerciseId) => {
    return getExerciseById(exerciseId);
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
