-- Composite indexes match the member-history keyset pagination order. The id
-- tie-breaker prevents rows with identical dates/times from being skipped.
create index if not exists attendance_member_history_idx
    on public.attendance (member_id, date desc, check_in desc, id desc);

create index if not exists payments_member_history_idx
    on public.payments (member_id, date desc, id desc);

create index if not exists broadcasts_target_history_idx
    on public.broadcasts (target, sent_at desc, id desc);
