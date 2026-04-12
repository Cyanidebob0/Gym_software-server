import supabase from '../config/supabase';

export const generateInvoiceId = async (gymId: string): Promise<string> => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}`;

    const { count, error } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', gymId)
        .like('invoice_id', `${prefix}-%`);

    const seq = (error || count === null ? 0 : count) + 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
};

export const getAll = async (gymId: string) => {
    const { data, error } = await supabase
        .from('payments')
        .select('*, members(name), plans(name)')
        .eq('gym_id', gymId)
        .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return data.map((p: any) => ({
        ...p,
        member_name: p.members?.name ?? null,
        plan_name: p.plans?.name ?? null,
        members: undefined,
        plans: undefined,
    }));
};

export const getById = async (gymId: string, paymentId: string) => {
    const { data, error } = await supabase
        .from('payments')
        .select('*, members(name), plans(name)')
        .eq('id', paymentId)
        .eq('gym_id', gymId)
        .single();

    if (error || !data) throw new Error('Payment not found');
    return {
        ...data,
        member_name: data.members?.name ?? null,
        plan_name: data.plans?.name ?? null,
        members: undefined,
        plans: undefined,
    };
};

export const create = async (gymId: string, body: Record<string, any>) => {
    const invoice_id = await generateInvoiceId(gymId);
    const { data, error } = await supabase
        .from('payments')
        .insert({ ...body, gym_id: gymId, invoice_id })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getMonthlyRevenue = async (gymId: string) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('payments')
        .select('amount')
        .eq('gym_id', gymId)
        .eq('status', 'completed')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

    if (error) throw new Error(error.message);
    return data.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
};

export const getYearlyRevenue = async (gymId: string) => {
    const startOfYear = `${new Date().getFullYear()}-01-01`;

    const { data, error } = await supabase
        .from('payments')
        .select('amount')
        .eq('gym_id', gymId)
        .eq('status', 'completed')
        .gte('date', startOfYear);

    if (error) throw new Error(error.message);
    return data.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
};

export const getStats = async (gymId: string) => {
    const [monthly, yearly] = await Promise.all([
        getMonthlyRevenue(gymId),
        getYearlyRevenue(gymId),
    ]);
    return { monthly_revenue: monthly, yearly_revenue: yearly };
};
