-- Remove unnecessary anonymous access to the SECURITY DEFINER role helper.
revoke execute on function public.current_app_role() from public;
revoke execute on function public.current_app_role() from anon;
grant execute on function public.current_app_role() to authenticated;

-- Foreign-key indexes reported by the Supabase performance advisor.
create index if not exists broadcasts_sent_by_idx on public.broadcasts (sent_by);
create index if not exists payments_plan_id_idx on public.payments (plan_id);
create index if not exists refunds_payment_id_idx on public.refunds (payment_id);

-- Keep one status index and remove the confirmed duplicate.
drop index if exists public.members_status_idx;
