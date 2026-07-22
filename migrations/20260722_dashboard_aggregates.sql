-- AUD-05: owner analytics aggregates move from Node into SQL so the server
-- receives aggregate values instead of raw payment/attendance/member rows.
-- Date boundaries are computed by the caller and passed in so every query
-- carries bounded date predicates. All functions are service_role only,
-- mirroring set_recommended_plan.

create index if not exists members_join_date_idx
    on public.members (join_date)
    where join_date is not null;

-- Monthly revenue buckets plus month-to-date / year-to-date totals in one
-- bounded scan of completed payments. Callers pass p_from as the earlier of
-- the chart window start and the year start; p_to caps every total.
create or replace function public.revenue_overview(
    p_from date,
    p_to date,
    p_month_start date,
    p_year_start date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with completed as (
        select amount, date
        from public.payments
        where status = 'completed'
          and date >= p_from
          and date <= p_to
    ),
    by_month as (
        select to_char(date, 'YYYY-MM') as month, sum(amount) as total
        from completed
        group by 1
    )
    select jsonb_build_object(
        'monthly', coalesce(
            (select jsonb_agg(jsonb_build_object('month', month, 'total', total) order by month)
             from by_month),
            '[]'::jsonb
        ),
        'monthly_revenue', coalesce((select sum(amount) from completed where date >= p_month_start), 0),
        'yearly_revenue', coalesce((select sum(amount) from completed where date >= p_year_start), 0)
    );
$$;

-- Per-day attendance counts for one week plus today's totals. today_present
-- counts members who have checked in but not yet out.
create or replace function public.attendance_week_overview(
    p_week_start date,
    p_week_end date,
    p_today date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with day_counts as (
        select date,
               count(*) as total,
               count(*) filter (where check_out is null) as present
        from public.attendance
        where date >= p_week_start
          and date <= p_week_end
        group by date
    )
    select jsonb_build_object(
        'days', coalesce(
            (select jsonb_agg(jsonb_build_object('date', date, 'total', total) order by date)
             from day_counts),
            '[]'::jsonb
        ),
        'today_total', coalesce((select total from day_counts where date = p_today), 0),
        'today_present', coalesce((select present from day_counts where date = p_today), 0)
    );
$$;

-- Cumulative member counts at the end of each requested month: members who
-- joined before the window are folded into a baseline, then a running sum
-- over per-month joins produces the growth curve without shipping join dates.
create or replace function public.member_growth(
    p_first_month date,
    p_months integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with months as (
        select (p_first_month + make_interval(months => n))::date as month_start
        from generate_series(0, p_months - 1) as n
    ),
    joins_by_month as (
        select date_trunc('month', join_date)::date as month_start, count(*) as joined
        from public.members
        where join_date is not null
          and join_date >= p_first_month
          and join_date < (p_first_month + make_interval(months => p_months))::date
        group by 1
    ),
    baseline as (
        select count(*) as joined
        from public.members
        where join_date is not null
          and join_date < p_first_month
    )
    select coalesce(jsonb_agg(row_totals.entry order by row_totals.month_start), '[]'::jsonb)
    from (
        select m.month_start,
               jsonb_build_object(
                   'month', to_char(m.month_start, 'YYYY-MM'),
                   'total', (select joined from baseline)
                            + sum(coalesce(j.joined, 0)) over (order by m.month_start)
               ) as entry
        from months m
        left join joins_by_month j on j.month_start = m.month_start
    ) as row_totals;
$$;

-- Member counts by effective status. Mirrors computeStatus in
-- member-management.service.ts: access_state wins, then non-expiry statuses
-- pass through, then days-until-expiry against reminder/grace windows.
create or replace function public.member_status_stats(
    p_today date,
    p_reminder_days integer,
    p_grace_days integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with computed as (
        select case
            when access_state = 'blocked' then 'blocked'
            when access_state = 'cancelled' then 'cancelled'
            when expiry_date is null
                 or status not in ('active', 'expiring_soon', 'expired') then status
            when (expiry_date - p_today) > p_reminder_days then 'active'
            when (expiry_date - p_today) >= -p_grace_days then 'expiring_soon'
            else 'expired'
        end as effective_status
        from public.members
    )
    select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where effective_status = 'active'),
        'expired', count(*) filter (where effective_status = 'expired'),
        'expiring_soon', count(*) filter (where effective_status = 'expiring_soon'),
        'blocked', count(*) filter (where effective_status = 'blocked'),
        'cancelled', count(*) filter (where effective_status = 'cancelled'),
        'pending', count(*) filter (where effective_status = 'pending')
    )
    from computed;
$$;

revoke all on function public.revenue_overview(date, date, date, date) from public, anon, authenticated;
revoke all on function public.attendance_week_overview(date, date, date) from public, anon, authenticated;
revoke all on function public.member_growth(date, integer) from public, anon, authenticated;
revoke all on function public.member_status_stats(date, integer, integer) from public, anon, authenticated;

grant execute on function public.revenue_overview(date, date, date, date) to service_role;
grant execute on function public.attendance_week_overview(date, date, date) to service_role;
grant execute on function public.member_growth(date, integer) to service_role;
grant execute on function public.member_status_stats(date, integer, integer) to service_role;
