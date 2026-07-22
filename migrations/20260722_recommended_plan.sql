alter table public.plans
    add column if not exists is_recommended boolean not null default false;

comment on column public.plans.is_recommended is
    'The single active membership plan highlighted by the gym owner.';

-- Preserve the existing UI convention on first rollout: prefer the second
-- cheapest active plan, falling back to the only active plan when necessary.
with ranked_active_plans as (
    select id, row_number() over (order by price, id) as position
    from public.plans
    where is_active = true
), initial_recommendation as (
    select id
    from ranked_active_plans
    order by case when position = 2 then 0 else position end
    limit 1
)
update public.plans
set is_recommended = true
where id = (select id from initial_recommendation)
  and not exists (
      select 1 from public.plans where is_recommended = true
  );

create unique index if not exists plans_single_recommended_idx
    on public.plans (is_recommended)
    where is_recommended = true;

create or replace function public.set_recommended_plan(target_plan_id uuid)
returns public.plans
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_plan public.plans;
begin
    select *
    into selected_plan
    from public.plans
    where id = target_plan_id
      and is_active = true
    for update;

    if not found then
        raise exception 'Only an active plan can be recommended';
    end if;

    update public.plans
    set is_recommended = false
    where is_recommended = true
      and id <> target_plan_id;

    update public.plans
    set is_recommended = true
    where id = target_plan_id
    returning * into selected_plan;

    return selected_plan;
end;
$$;

revoke all on function public.set_recommended_plan(uuid) from public, anon, authenticated;
grant execute on function public.set_recommended_plan(uuid) to service_role;
