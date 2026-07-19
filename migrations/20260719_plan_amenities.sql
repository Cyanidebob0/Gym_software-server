alter table public.plans
    add column if not exists amenities text[] not null default '{}'::text[];

comment on column public.plans.amenities is
    'Owner-selected standard and custom amenities included with this membership plan.';
