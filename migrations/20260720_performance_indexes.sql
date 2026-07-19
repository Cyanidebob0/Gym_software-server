-- Indexes for the most frequent owner dashboard, payment, attendance, and
-- member-status queries. IF NOT EXISTS keeps this migration safe to re-run.

create index if not exists payments_status_date_idx
    on public.payments (status, date desc);

create index if not exists payments_member_status_date_idx
    on public.payments (member_id, status, date desc);

create index if not exists attendance_date_check_in_idx
    on public.attendance (date, check_in desc);

create index if not exists attendance_member_date_idx
    on public.attendance (member_id, date desc);

create index if not exists members_created_at_idx
    on public.members (created_at desc);

create index if not exists members_status_expiry_idx
    on public.members (status, expiry_date);

create index if not exists plans_active_price_idx
    on public.plans (is_active, price);

create index if not exists refunds_status_created_at_idx
    on public.refunds (status, created_at desc);

create index if not exists broadcasts_sent_at_idx
    on public.broadcasts (sent_at desc);
