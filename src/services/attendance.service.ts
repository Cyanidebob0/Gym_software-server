import supabase from '../config/supabase';
import { gymDateString, gymTimeString } from '../utils/gym-time';

export const getByDate = async (date: string) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*, members(name)')
        .eq('date', date)
        .order('check_in', { ascending: false });

    if (error) throw new Error(error.message);
    return data.map((a: any) => ({
        ...a,
        member_name: a.members?.name ?? null,
        members: undefined,
    }));
};

export const getByMember = async (memberId: string) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('member_id', memberId)
        .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

export const getTodayStats = async () => {
    const today = gymDateString();

    const { data, error } = await supabase
        .from('attendance')
        .select('id, check_out')
        .eq('date', today);

    if (error) throw new Error(error.message);

    const total = data.length;
    const present = data.filter((a: any) => !a.check_out).length;
    return { total, present };
};

export const markIn = async (body: { member_id: string; check_in: string; date?: string }) => {
    const date = body.date || gymDateString();

    const { data, error } = await supabase
        .from('attendance')
        .insert({ member_id: body.member_id, check_in: body.check_in, date })
        .select('*, members(name)')
        .single();

    if (error) throw new Error(error.message);
    return { ...data, member_name: data.members?.name ?? null, members: undefined };
};

export const markOut = async (attendanceId: string, checkOut: string) => {
    const { data, error } = await supabase
        .from('attendance')
        .update({ check_out: checkOut })
        .eq('id', attendanceId)
        .select('*, members(name)')
        .single();

    if (error) throw new Error(error.message);
    return { ...data, member_name: data.members?.name ?? null, members: undefined };
};

export const remove = async (attendanceId: string) => {
    const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', attendanceId);

    if (error) throw new Error(error.message);
};
