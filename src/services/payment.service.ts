import supabase from '../config/supabase';

export const generateInvoiceId = async (): Promise<string> => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}`;

    const { count, error } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .like('invoice_id', `${prefix}-%`);

    const seq = (error || count === null ? 0 : count) + 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
};

export const getAll = async (limit?: number, offset?: number) => {
    let query = supabase
        .from('payments')
        .select('*, members(name), plans(name)')
        .order('date', { ascending: false });

    if (limit !== undefined) query = query.range(offset || 0, (offset || 0) + limit - 1);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data.map((p: any) => ({
        ...p,
        member_name: p.members?.name ?? null,
        plan_name: p.plans?.name ?? null,
        members: undefined,
        plans: undefined,
    }));
};

export const getById = async (paymentId: string) => {
    const { data, error } = await supabase
        .from('payments')
        .select('*, members(name), plans(name)')
        .eq('id', paymentId)
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

export const create = async (body: Record<string, any>) => {
    const invoice_id = await generateInvoiceId();
    const { data, error } = await supabase
        .from('payments')
        .insert({ ...body, invoice_id })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getStats = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const startOfYear = `${now.getFullYear()}-01-01`;

    const [{ data: monthlyData, error: e1 }, { data: yearlyData, error: e2 }] = await Promise.all([
        supabase
            .from('payments')
            .select('amount')
            .eq('status', 'completed')
            .gte('date', startOfMonth)
            .lte('date', endOfMonth),
        supabase
            .from('payments')
            .select('amount')
            .eq('status', 'completed')
            .gte('date', startOfYear),
    ]);

    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);

    return {
        monthly_revenue: (monthlyData || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0),
        yearly_revenue: (yearlyData || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0),
    };
};
