import supabase from '../config/supabase';
import { getStats as getMemberStats, getAll as getAllMembers } from './member-management.service';
import { createAsyncCache } from '../utils/async-cache';

const isoDate = (date: Date) => date.toISOString().split('T')[0];
const dashboardCache = createAsyncCache<Record<string, any>>(15_000);

const monthBuckets = () => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
        const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
        return {
            key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
            label: month.toLocaleString('en-US', { month: 'short' }),
            value: 0,
        };
    });
};

export const getMonthlyRevenue = async () => {
    const buckets = monthBuckets();
    const first = new Date(`${buckets[0].key}-01T00:00:00`);
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const { data, error } = await supabase
        .from('payments')
        .select('amount, date')
        .eq('status', 'completed')
        .gte('date', isoDate(first))
        .lte('date', isoDate(last));

    if (error) throw new Error(error.message);
    const byMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const payment of data ?? []) {
        const bucket = byMonth.get(String(payment.date).slice(0, 7));
        if (bucket) bucket.value += Number(payment.amount) || 0;
    }
    return buckets.map(({ label, value }) => ({ label, value }));
};

const getRevenueOverview = async () => {
    const buckets = monthBuckets();
    const firstBucketDate = `${buckets[0].key}-01`;
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const queryStart = firstBucketDate < yearStart ? firstBucketDate : yearStart;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const { data, error } = await supabase
        .from('payments')
        .select('amount, date')
        .eq('status', 'completed')
        .gte('date', queryStart)
        .lte('date', monthEnd);
    if (error) throw new Error(error.message);

    const byMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    let monthlyRevenue = 0;
    let yearlyRevenue = 0;
    for (const payment of data ?? []) {
        const amount = Number(payment.amount) || 0;
        const date = String(payment.date);
        const bucket = byMonth.get(date.slice(0, 7));
        if (bucket) bucket.value += amount;
        if (date >= monthStart) monthlyRevenue += amount;
        if (date >= yearStart) yearlyRevenue += amount;
    }

    return {
        monthlyRevenue: buckets.map(({ label, value }) => ({ label, value })),
        paymentStats: { monthly_revenue: monthlyRevenue, yearly_revenue: yearlyRevenue },
    };
};

export const getWeeklyAttendance = async () => {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const { data, error } = await supabase
        .from('attendance')
        .select('date')
        .gte('date', isoDate(monday))
        .lte('date', isoDate(sunday));
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const record of data ?? []) {
        counts.set(record.date, (counts.get(record.date) ?? 0) + 1);
    }
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return labels.map((label, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return { label, value: counts.get(isoDate(date)) ?? 0 };
    });
};

const getAttendanceOverview = async () => {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const today = isoDate(now);

    const { data, error } = await supabase
        .from('attendance')
        .select('date, check_out')
        .gte('date', isoDate(monday))
        .lte('date', isoDate(sunday));
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    let todayTotal = 0;
    let todayPresent = 0;
    for (const record of data ?? []) {
        counts.set(record.date, (counts.get(record.date) ?? 0) + 1);
        if (record.date === today) {
            todayTotal++;
            if (!record.check_out) todayPresent++;
        }
    }
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weeklyAttendance = labels.map((label, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return { label, value: counts.get(isoDate(date)) ?? 0 };
    });

    return {
        weeklyAttendance,
        todayAttendance: { total: todayTotal, present: todayPresent },
    };
};

export const getMemberGrowth = async () => {
    const now = new Date();
    const starts = Array.from({ length: 6 }, (_, index) =>
        new Date(now.getFullYear(), now.getMonth() - (5 - index), 1));
    const finalEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const { data, error } = await supabase
        .from('members')
        .select('join_date')
        .not('join_date', 'is', null)
        .lte('join_date', isoDate(finalEnd));
    if (error) throw new Error(error.message);

    return starts.map((start) => {
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        return {
            label: start.toLocaleString('en-US', { month: 'short' }),
            value: (data ?? []).filter((member) => member.join_date <= isoDate(end)).length,
        };
    });
};

export const getDashboard = async () => dashboardCache.get(async () => {
    const [revenueOverview, attendanceOverview, memberGrowth, memberStats, members] = await Promise.all([
        getRevenueOverview(),
        getAttendanceOverview(),
        getMemberGrowth(),
        getMemberStats(),
        getAllMembers(50, 0),
    ]);

    const monthlyRevenue = revenueOverview.monthlyRevenue;

    const currentRevenue = monthlyRevenue[monthlyRevenue.length - 1]?.value ?? 0;
    const previousRevenue = monthlyRevenue[monthlyRevenue.length - 2]?.value ?? 0;
    const percent = previousRevenue === 0
        ? (currentRevenue > 0 ? 100 : 0)
        : Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100);

    return {
        monthly_revenue: monthlyRevenue,
        revenue_change: { change: Math.abs(percent), direction: percent >= 0 ? 'up' : 'down' },
        weekly_attendance: attendanceOverview.weeklyAttendance,
        member_growth: memberGrowth,
        member_stats: memberStats,
        payment_stats: revenueOverview.paymentStats,
        today_attendance: attendanceOverview.todayAttendance,
        members,
    };
});

export const invalidateDashboardCache = () => dashboardCache.invalidate();
