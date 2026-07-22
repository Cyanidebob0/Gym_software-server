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

// Date boundaries are computed here and passed to the RPC so the query stays
// bounded; the database returns aggregates only, never payment rows.
const getRevenueOverview = async () => {
    const buckets = monthBuckets();
    const firstBucketDate = `${buckets[0].key}-01`;
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const queryStart = firstBucketDate < yearStart ? firstBucketDate : yearStart;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const { data, error } = await supabase.rpc('revenue_overview', {
        p_from: queryStart,
        p_to: monthEnd,
        p_month_start: monthStart,
        p_year_start: yearStart,
    });
    if (error) throw new Error(error.message);

    const byMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const row of data?.monthly ?? []) {
        const bucket = byMonth.get(String(row.month));
        if (bucket) bucket.value = Number(row.total) || 0;
    }

    return {
        monthlyRevenue: buckets.map(({ label, value }) => ({ label, value })),
        paymentStats: {
            monthly_revenue: Number(data?.monthly_revenue) || 0,
            yearly_revenue: Number(data?.yearly_revenue) || 0,
        },
    };
};

const getAttendanceOverview = async () => {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const today = isoDate(now);

    const { data, error } = await supabase.rpc('attendance_week_overview', {
        p_week_start: isoDate(monday),
        p_week_end: isoDate(sunday),
        p_today: today,
    });
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>(
        (data?.days ?? []).map((row: any): [string, number] => [String(row.date), Number(row.total) || 0]),
    );
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weeklyAttendance = labels.map((label, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return { label, value: counts.get(isoDate(date)) ?? 0 };
    });

    return {
        weeklyAttendance,
        todayAttendance: {
            total: Number(data?.today_total) || 0,
            present: Number(data?.today_present) || 0,
        },
    };
};

const getMemberGrowth = async () => {
    const buckets = monthBuckets();
    const { data, error } = await supabase.rpc('member_growth', {
        p_first_month: `${buckets[0].key}-01`,
        p_months: buckets.length,
    });
    if (error) throw new Error(error.message);

    const totals = new Map<string, number>(
        (data ?? []).map((row: any): [string, number] => [String(row.month), Number(row.total) || 0]),
    );
    return buckets.map(({ key, label }) => ({ label, value: totals.get(key) ?? 0 }));
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
