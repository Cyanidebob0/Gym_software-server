import supabase from '../config/supabase';

export const getByDate = async (gymId: string, date: string) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*, members(name)')
        .eq('gym_id', gymId)
        .eq('date', date)
        .order('check_in', { ascending: false });

    if (error) throw new Error(error.message);
    return data.map((a: any) => ({
        ...a,
        member_name: a.members?.name ?? null,
        members: undefined,
    }));
};

export const getByMember = async (gymId: string, memberId: string) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('gym_id', gymId)
        .eq('member_id', memberId)
        .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

export const getTodayStats = async (gymId: string) => {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('attendance')
        .select('id, check_out')
        .eq('gym_id', gymId)
        .eq('date', today);

    if (error) throw new Error(error.message);

    const total = data.length;
    const present = data.filter((a: any) => !a.check_out).length;
    return { total, present };
};

export const markIn = async (gymId: string, body: { member_id: string; check_in: string; date?: string }) => {
    const date = body.date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('attendance')
        .insert({ gym_id: gymId, member_id: body.member_id, check_in: body.check_in, date })
        .select('*, members(name)')
        .single();

    if (error) throw new Error(error.message);
    return { ...data, member_name: data.members?.name ?? null, members: undefined };
};

export const markOut = async (gymId: string, attendanceId: string, checkOut: string) => {
    const { data, error } = await supabase
        .from('attendance')
        .update({ check_out: checkOut })
        .eq('id', attendanceId)
        .eq('gym_id', gymId)
        .select('*, members(name)')
        .single();

    if (error) throw new Error(error.message);
    return { ...data, member_name: data.members?.name ?? null, members: undefined };
};

export const remove = async (gymId: string, attendanceId: string) => {
    const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', attendanceId)
        .eq('gym_id', gymId);

    if (error) throw new Error(error.message);
};
