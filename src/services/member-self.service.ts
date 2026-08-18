import supabase from '../config/supabase';
import { get as getSettings } from './settings.service';
import { computeStatus } from './member-management.service';
import { getMemberIdByUserId, rememberMemberId } from './member-identity-cache';
import { decodeCursor, encodeCursor } from '../utils/pagination';
import { gymDateString, gymTimeString } from '../utils/gym-time';

type HistoryOptions = { limit: number; cursor?: string };
const DASHBOARD_ATTENDANCE_LIMIT = 10;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

const assertCursorValue = (value: string, pattern: RegExp) => {
    if (!pattern.test(value)) throw new Error('Invalid cursor');
};

const pageResult = <T>(rows: T[], limit: number, cursorFor: (row: T) => Record<string, string>, total?: number | null) => {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
        items,
        limit,
        next_cursor: hasMore && items.length > 0 ? encodeCursor(cursorFor(items[items.length - 1])) : null,
        has_more: hasMore,
        ...(total === undefined ? {} : { total: total ?? 0 }),
    };
};

export const getMemberDashboardByUserId = async (userId: string) => {
    const [{ data: member, error: memberError }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('*, plans(name, duration_days, price)')
            .eq('user_id', userId)
            .maybeSingle(),
        getSettings(),
    ]);

    if (memberError) throw new Error(memberError.message);
    if (!member) {
        return {
            status: null,
            profile: null,
            attendance: [],
            today_check_in: null,
            online_registration: settings.online_registration !== false,
        };
    }

    rememberMemberId(userId, member.id);
    const computedStatus = computeStatus(
        member,
        settings.expiry_reminder_days ?? 7,
        settings.grace_period_days ?? 3,
    );
    const status = {
        id: member.id,
        name: member.name,
        access_state: member.access_state,
        status: computedStatus,
    };

    if (!['active', 'expired', 'expiring_soon', 'cancelled'].includes(computedStatus)) {
        return {
            status,
            profile: null,
            attendance: [],
            today_check_in: null,
            online_registration: settings.online_registration !== false,
        };
    }

    const { data: attendance, error: attendanceError } = await supabase
        .from('attendance')
        .select('id, date, check_in, check_out')
        .eq('member_id', member.id)
        .order('date', { ascending: false })
        .order('check_in', { ascending: false })
        .order('id', { ascending: false })
        .limit(DASHBOARD_ATTENDANCE_LIMIT);
    if (attendanceError) throw new Error(attendanceError.message);

    const today = gymDateString();
    const todayCheckIn = (attendance ?? []).find((record) => record.date === today) ?? null;
    const profile = {
        ...member,
        status: computedStatus,
        plan_name: member.plans?.name ?? null,
        plans: member.plans,
    };

    return {
        status,
        profile,
        attendance: attendance ?? [],
        today_check_in: todayCheckIn,
        online_registration: settings.online_registration !== false,
    };
};

export const getProfileByUserId = async (userId: string) => {
    const { data, error } = await supabase
        .from('members')
        .select('*, plans(name, duration_days, price)')
        .eq('user_id', userId)
        .single();

    if (error || !data) throw new Error('Member profile not found');

    const settings = await getSettings();
    const reminderDays = settings.expiry_reminder_days ?? 7;
    const graceDays = settings.grace_period_days ?? 3;

    return {
        ...data,
        status: computeStatus(data, reminderDays, graceDays),
        plan_name: data.plans?.name ?? null,
        plans: undefined,
    };
};

export const getAttendanceByUserId = async (userId: string, options: HistoryOptions) => {
    const memberId = await getMemberIdByUserId(userId);
    const cursor = decodeCursor(options.cursor, ['date', 'check_in', 'id']);
    if (cursor) {
        assertCursorValue(cursor.date, datePattern);
        assertCursorValue(cursor.check_in, timePattern);
        assertCursorValue(cursor.id, uuidPattern);
    }

    const attendanceTable = supabase.from('attendance');
    let query = options.cursor
        ? attendanceTable.select('id, date, check_in, check_out')
        : attendanceTable.select('id, date, check_in, check_out', { count: 'exact' });
    query = query
        .eq('member_id', memberId)
        .order('date', { ascending: false })
        .order('check_in', { ascending: false })
        .order('id', { ascending: false })
        .limit(options.limit + 1);

    if (cursor) {
        query = query.or(
            `date.lt.${cursor.date},and(date.eq.${cursor.date},check_in.lt.${cursor.check_in}),and(date.eq.${cursor.date},check_in.eq.${cursor.check_in},id.lt.${cursor.id})`,
        );
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return pageResult(data ?? [], options.limit, (row: any) => ({
        date: row.date,
        check_in: row.check_in,
        id: row.id,
    }), options.cursor ? undefined : count);
};

export const getPaymentsByUserId = async (userId: string, options: HistoryOptions) => {
    const memberId = await getMemberIdByUserId(userId);
    const cursor = decodeCursor(options.cursor, ['date', 'id']);
    if (cursor) {
        assertCursorValue(cursor.date, datePattern);
        assertCursorValue(cursor.id, uuidPattern);
    }

    let query = supabase
        .from('payments')
        .select('*, plans(name)')
        .eq('member_id', memberId)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(options.limit + 1);

    if (cursor) {
        query = query.or(`date.lt.${cursor.date},and(date.eq.${cursor.date},id.lt.${cursor.id})`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((p: any) => ({ ...p, plan_name: p.plans?.name ?? null, plans: undefined }));
    return pageResult(rows, options.limit, (row: any) => ({ date: row.date, id: row.id }));
};

export const updateProfileByUserId = async (userId: string, body: { name?: string; phone?: string; address?: string; gender?: string }) => {
    const memberId = await getMemberIdByUserId(userId);

    const allowed: Record<string, any> = {};
    if (body.name !== undefined) allowed.name = body.name;
    if (body.phone !== undefined) allowed.phone = body.phone;
    if (body.address !== undefined) allowed.address = body.address;
    if (body.gender !== undefined) allowed.gender = body.gender;

    if (Object.keys(allowed).length === 0) throw new Error('No fields to update');

    const { data, error } = await supabase
        .from('members')
        .update(allowed)
        .eq('id', memberId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const selfCheckIn = async (userId: string) => {
    const [{ data: member }, settings] = await Promise.all([
        supabase
            .from('members')
            .select('id, status, access_state, expiry_date')
            .eq('user_id', userId)
            .single(),
        getSettings(),
    ]);

    if (!member) throw new Error('Member not found');
    const status = computeStatus(
        member,
        settings.expiry_reminder_days ?? 7,
        settings.grace_period_days ?? 3,
    );
    if (!['active', 'expiring_soon'].includes(status)) throw new Error('Membership not active');

    const today = gymDateString();
    const checkIn = gymTimeString();

    const { data: existing } = await supabase
        .from('attendance')
        .select('id, check_in, check_out')
        .eq('member_id', member.id)
        .eq('date', today)
        .is('check_out', null)
        .limit(1);

    if (existing && existing.length > 0) {
        return { already_checked_in: true, attendance: existing[0] };
    }

    const { data, error } = await supabase
        .from('attendance')
        .insert({ member_id: member.id, check_in: checkIn, date: today })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return { already_checked_in: false, attendance: data };
};

export const selfCheckOut = async (userId: string) => {
    const memberId = await getMemberIdByUserId(userId);

    const today = gymDateString();
    const checkOut = gymTimeString();

    const { data: open } = await supabase
        .from('attendance')
        .select('id')
        .eq('member_id', memberId)
        .eq('date', today)
        .is('check_out', null)
        .limit(1);

    if (!open || open.length === 0) throw new Error('No open check-in found for today');

    const { data, error } = await supabase
        .from('attendance')
        .update({ check_out: checkOut })
        .eq('id', open[0].id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getTodayCheckIn = async (userId: string) => {
    let memberId: string;
    try {
        memberId = await getMemberIdByUserId(userId);
    } catch {
        return null;
    }

    const today = gymDateString();

    const { data } = await supabase
        .from('attendance')
        .select('id, check_in, check_out')
        .eq('member_id', memberId)
        .eq('date', today)
        .order('check_in', { ascending: false })
        .limit(1);

    if (!data || data.length === 0) return null;
    return data[0];
};

export const getBroadcastsByUserId = async (userId: string, options: HistoryOptions) => {
    const { data: member } = await supabase
        .from('members')
        .select('id, status, expiry_date')
        .eq('user_id', userId)
        .maybeSingle();

    if (!member) throw new Error('Member not found');

    const settings = await getSettings();
    const status = computeStatus(
        member,
        settings.expiry_reminder_days ?? 7,
        settings.grace_period_days ?? 3,
    );

    const cursor = decodeCursor(options.cursor, ['sent_at', 'id']);
    if (cursor) {
        assertCursorValue(cursor.sent_at, timestampPattern);
        assertCursorValue(cursor.id, uuidPattern);
    }

    const targets = ['all'];
    if (status === 'active') targets.push('active');
    if (status === 'expiring_soon') targets.push('expiring');

    // Keep target selection in Postgres instead of loading every broadcast and filtering in Node.
    const targetFilter = `or(target.is.null,target.in.(${targets.join(',')}))`;
    const cursorFilter = cursor
        ? `or(sent_at.lt.${cursor.sent_at},and(sent_at.eq.${cursor.sent_at},id.lt.${cursor.id}))`
        : null;
    let query = supabase
        .from('broadcasts')
        .select('*')
        .order('sent_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(options.limit + 1);

    query = cursorFilter
        ? query.or(`and(${targetFilter},${cursorFilter})`)
        : query.or(`target.is.null,target.in.(${targets.join(',')})`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return pageResult(data ?? [], options.limit, (row: any) => ({ sent_at: row.sent_at, id: row.id }));
};
