import supabase from '../config/supabase';

// Revenue per month for last 6 months
export const getMonthlyRevenue = async (gymId: string) => {
    const months: { label: string; value: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = d.toISOString().split('T')[0];
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        const label = d.toLocaleString('en-US', { month: 'short' });

        const { data } = await supabase
            .from('payments')
            .select('amount')
            .eq('gym_id', gymId)
            .eq('status', 'completed')
            .gte('date', start)
            .lte('date', end);

        const total = (data || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
        months.push({ label, value: total });
    }
    return months;
};

// Revenue % change: this month vs last month
export const getRevenueChange = async (gymId: string) => {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    const [{ data: thisData }, { data: lastData }] = await Promise.all([
        supabase.from('payments').select('amount').eq('gym_id', gymId).eq('status', 'completed').gte('date', thisStart).lte('date', thisEnd),
        supabase.from('payments').select('amount').eq('gym_id', gymId).eq('status', 'completed').gte('date', lastStart).lte('date', lastEnd),
    ]);

    const thisTotal = (thisData || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    const lastTotal = (lastData || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

    if (lastTotal === 0) return { change: thisTotal > 0 ? 100 : 0, direction: 'up' as const };
    const pct = Math.round(((thisTotal - lastTotal) / lastTotal) * 100);
    return { change: Math.abs(pct), direction: pct >= 0 ? 'up' as const : 'down' as const };
};

// Weekly attendance: daily check-ins for current week (Mon-Sun)
export const getWeeklyAttendance = async (gymId: string) => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const result: { label: string; value: number }[] = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];

        const { data } = await supabase
            .from('attendance')
            .select('id')
            .eq('gym_id', gymId)
            .eq('date', dateStr);

        result.push({ label: days[i], value: (data || []).length });
    }
    return result;
};

// Member growth: cumulative total at end of each of last 6 months
export const getMemberGrowth = async (gymId: string) => {
    const months: { label: string; value: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // last day of month
        const endDate = d.toISOString().split('T')[0];
        const label = new Date(now.getFullYear(), now.getMonth() - i, 1)
            .toLocaleString('en-US', { month: 'short' });

        const { data } = await supabase
            .from('members')
            .select('id')
            .eq('gym_id', gymId)
            .lte('join_date', endDate);

        months.push({ label, value: (data || []).length });
    }
    return months;
};

// Full dashboard payload
export const getDashboard = async (gymId: string) => {
    const [monthlyRevenue, revenueChange, weeklyAttendance, memberGrowth] = await Promise.all([
        getMonthlyRevenue(gymId),
        getRevenueChange(gymId),
        getWeeklyAttendance(gymId),
        getMemberGrowth(gymId),
    ]);

    return {
        monthly_revenue: monthlyRevenue,
        revenue_change: revenueChange,
        weekly_attendance: weeklyAttendance,
        member_growth: memberGrowth,
    };
};
