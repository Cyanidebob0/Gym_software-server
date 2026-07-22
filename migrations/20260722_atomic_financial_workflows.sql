-- Atomic financial workflows for payments, memberships, and refunds.
-- Apply this migration before deploying the server code that calls these RPCs.

create table if not exists public.financial_idempotency_keys (
    operation text not null,
    idempotency_key uuid not null,
    request_hash text not null,
    response jsonb not null,
    created_at timestamptz not null default now(),
    primary key (operation, idempotency_key)
);

alter table public.financial_idempotency_keys enable row level security;
revoke all on table public.financial_idempotency_keys from public, anon, authenticated;
grant all on table public.financial_idempotency_keys to service_role;

create index if not exists financial_idempotency_created_at_idx
    on public.financial_idempotency_keys (created_at);

-- Keep the newest request if an older deployment allowed concurrent duplicates.
with ranked as (
    select id,
           row_number() over (partition by member_id order by created_at desc, id desc) as position
    from public.payments
    where status = 'pending'
)
update public.payments
set status = 'failed'
where id in (select id from ranked where position > 1);

create unique index if not exists payments_one_pending_per_member_idx
    on public.payments (member_id)
    where status = 'pending';

create unique index if not exists payments_invoice_id_unique_idx
    on public.payments (invoice_id)
    where invoice_id is not null;

create or replace function public.financial_idempotency_replay(
    p_operation text,
    p_idempotency_key uuid,
    p_request_hash text
)
returns table (replayed boolean, stored_response jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_hash text;
begin
    perform pg_advisory_xact_lock(hashtextextended(p_operation || ':' || p_idempotency_key::text, 0));

    select request_hash, response
    into v_hash, stored_response
    from public.financial_idempotency_keys
    where operation = p_operation
      and idempotency_key = p_idempotency_key;

    if found then
        if v_hash <> p_request_hash then
            raise exception using
                errcode = 'P0001',
                message = 'Idempotency key was already used for a different request';
        end if;
        replayed := true;
        return next;
        return;
    end if;

    replayed := false;
    stored_response := null;
    return next;
end;
$$;

create or replace function public.financial_idempotency_store(
    p_operation text,
    p_idempotency_key uuid,
    p_request_hash text,
    p_response jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
    insert into public.financial_idempotency_keys (operation, idempotency_key, request_hash, response)
    values (p_operation, p_idempotency_key, p_request_hash, p_response);
$$;

create or replace function public.financial_request_payment(
    p_user_id uuid,
    p_plan_id uuid,
    p_method text,
    p_invoice_id text,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_member public.members%rowtype;
    v_plan public.plans%rowtype;
    v_payment public.payments%rowtype;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('request_payment', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    select * into v_member
    from public.members
    where user_id = p_user_id
    for update;

    if not found then raise exception 'Member not found'; end if;
    if v_member.status not in ('approved', 'active', 'expired', 'expiring_soon') then
        raise exception 'Your membership is not ready for a payment request';
    end if;
    if v_member.access_state in ('blocked', 'cancelled') then
        raise exception 'This membership cannot request a payment';
    end if;
    if p_method not in ('cash', 'upi') then
        raise exception 'Choose Cash or Offline UPI';
    end if;
    if p_invoice_id is null or btrim(p_invoice_id) = '' then raise exception 'Invoice ID is required'; end if;
    if v_member.status = 'approved' and v_member.plan_id is not null and v_member.plan_id <> p_plan_id then
        raise exception 'Choose the plan assigned by the gym owner';
    end if;

    select * into v_plan
    from public.plans
    where id = p_plan_id and is_active = true;
    if not found then raise exception 'Active membership plan not found'; end if;

    select * into v_payment
    from public.payments
    where member_id = v_member.id and status = 'pending'
    order by created_at desc, id desc
    limit 1;

    if not found then
        insert into public.payments (
            member_id, plan_id, amount, mode, method, status, date, invoice_id
        ) values (
            v_member.id, v_plan.id, v_plan.price, 'offline', p_method, 'pending', current_date, p_invoice_id
        ) returning * into v_payment;
    end if;

    -- An earlier request may already be pending for this member. Return that
    -- request's authoritative plan metadata rather than the newly requested plan.
    if v_payment.plan_id <> v_plan.id then
        select * into v_plan from public.plans where id = v_payment.plan_id;
    end if;

    v_response := to_jsonb(v_payment) || jsonb_build_object(
        'plan_name', v_plan.name,
        'duration_days', v_plan.duration_days
    );
    perform public.financial_idempotency_store(
        'request_payment', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

create or replace function public.financial_create_payment(
    p_member_id uuid,
    p_plan_id uuid,
    p_amount numeric,
    p_mode text,
    p_method text,
    p_status text,
    p_date date,
    p_invoice_id text,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_member public.members%rowtype;
    v_payment public.payments%rowtype;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('create_payment', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    select * into v_member from public.members where id = p_member_id for update;
    if not found then raise exception 'Member not found'; end if;
    if p_plan_id is not null and not exists (select 1 from public.plans where id = p_plan_id) then
        raise exception 'Membership plan not found';
    end if;
    if p_amount < 0 then raise exception 'Payment amount cannot be negative'; end if;
    if p_mode not in ('online', 'offline') then raise exception 'Invalid payment mode'; end if;
    if p_method not in ('cash', 'upi', 'card', 'online') then raise exception 'Invalid payment method'; end if;
    if p_status not in ('completed', 'pending', 'refunded', 'failed') then raise exception 'Invalid payment status'; end if;
    if p_invoice_id is null or btrim(p_invoice_id) = '' then raise exception 'Invoice ID is required'; end if;
    if p_status = 'pending' and exists (
        select 1 from public.payments where member_id = v_member.id and status = 'pending'
    ) then
        raise exception 'Member already has a pending payment request';
    end if;

    insert into public.payments (
        member_id, plan_id, amount, mode, method, status, date, invoice_id
    ) values (
        v_member.id, p_plan_id, p_amount, p_mode, p_method, p_status,
        coalesce(p_date, current_date), p_invoice_id
    ) returning * into v_payment;

    v_response := to_jsonb(v_payment);
    perform public.financial_idempotency_store(
        'create_payment', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

create or replace function public.financial_confirm_payment(
    p_payment_id uuid,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_payment public.payments%rowtype;
    v_member public.members%rowtype;
    v_plan public.plans%rowtype;
    v_today date := current_date;
    v_join_date date;
    v_expiry_date date;
    v_renewal_base date;
    v_initial boolean;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('confirm_payment', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    select * into v_payment from public.payments where id = p_payment_id for update;
    if not found then raise exception 'Payment request not found'; end if;
    if v_payment.status <> 'pending' then raise exception 'This payment request has already been handled'; end if;

    select * into v_member from public.members where id = v_payment.member_id for update;
    if not found then raise exception 'Payment member no longer exists'; end if;
    select * into v_plan from public.plans where id = v_payment.plan_id;
    if not found then raise exception 'Payment plan no longer exists'; end if;

    v_initial := v_member.status = 'approved';
    if v_member.status not in ('approved', 'active', 'expired', 'expiring_soon') then
        raise exception 'Member is not eligible for this payment';
    end if;
    if v_member.access_state in ('blocked', 'cancelled') then raise exception 'Member access is restricted'; end if;
    if v_payment.amount <> v_plan.price then raise exception 'Payment amount does not match the plan price'; end if;
    if v_initial and v_member.plan_id is not null and v_member.plan_id <> v_plan.id then
        raise exception 'Payment plan does not match the assigned plan';
    end if;

    v_join_date := coalesce(v_member.join_date, v_today);
    if v_initial then
        v_expiry_date := coalesce(v_member.expiry_date, v_join_date + v_plan.duration_days);
    else
        v_renewal_base := case
            when v_member.expiry_date is not null and v_member.expiry_date > v_today then v_member.expiry_date
            else v_today
        end;
        v_expiry_date := v_renewal_base + v_plan.duration_days;
    end if;

    update public.payments set status = 'completed' where id = v_payment.id returning * into v_payment;
    update public.members
    set plan_id = v_plan.id,
        join_date = v_join_date,
        expiry_date = v_expiry_date,
        status = 'active'
    where id = v_member.id;

    v_response := jsonb_build_object('payment_id', v_payment.id);
    perform public.financial_idempotency_store(
        'confirm_payment', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

create or replace function public.financial_reject_payment(
    p_payment_id uuid,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_payment public.payments%rowtype;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('reject_payment', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    select * into v_payment from public.payments where id = p_payment_id for update;
    if not found or v_payment.status <> 'pending' then
        raise exception 'Payment request was not found or has already been handled';
    end if;
    update public.payments set status = 'failed' where id = p_payment_id returning * into v_payment;

    v_response := jsonb_build_object('payment_id', v_payment.id);
    perform public.financial_idempotency_store(
        'reject_payment', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

create or replace function public.financial_activate_member(
    p_member_id uuid,
    p_plan_id uuid,
    p_join_date date,
    p_has_paid boolean,
    p_payment_method text,
    p_payment_date date,
    p_invoice_id text,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_member public.members%rowtype;
    v_plan public.plans%rowtype;
    v_payment_id uuid;
    v_expiry_date date;
    v_status text;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('activate_member', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    if p_join_date > current_date then raise exception 'Membership start date cannot be in the future'; end if;
    if p_has_paid and (p_payment_date is null or p_payment_method is null) then
        raise exception 'Payment method and date are required';
    end if;
    if p_has_paid and (p_invoice_id is null or btrim(p_invoice_id) = '') then raise exception 'Invoice ID is required'; end if;
    if p_has_paid and p_payment_date > current_date then raise exception 'Payment date cannot be in the future'; end if;

    select * into v_member from public.members where id = p_member_id for update;
    if not found then raise exception 'Member application not found'; end if;
    if v_member.status <> 'pending' then raise exception 'Only pending applications can be added'; end if;
    if v_member.access_state = 'blocked' then raise exception 'Blocked applications cannot be added'; end if;

    select * into v_plan from public.plans where id = p_plan_id and is_active = true;
    if not found then raise exception 'Active membership plan not found'; end if;

    v_expiry_date := p_join_date + v_plan.duration_days;
    v_status := case
        when not p_has_paid then 'approved'
        when v_expiry_date >= current_date then 'active'
        else 'expired'
    end;

    update public.members
    set plan_id = v_plan.id, join_date = p_join_date, expiry_date = v_expiry_date, status = v_status
    where id = v_member.id;

    if p_has_paid then
        insert into public.payments (
            member_id, plan_id, amount, mode, method, status, date, invoice_id
        ) values (
            v_member.id, v_plan.id, v_plan.price,
            case when p_payment_method = 'online' then 'online' else 'offline' end,
            p_payment_method, 'completed', p_payment_date, p_invoice_id
        ) returning id into v_payment_id;
    end if;

    v_response := jsonb_build_object(
        'id', v_member.id,
        'status', v_status,
        'plan_id', v_plan.id,
        'plan_name', v_plan.name,
        'join_date', p_join_date,
        'expiry_date', v_expiry_date,
        'payment_recorded', p_has_paid,
        'payment_id', v_payment_id
    );
    perform public.financial_idempotency_store(
        'activate_member', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

create or replace function public.financial_renew_member(
    p_member_id uuid,
    p_plan_id uuid,
    p_has_paid boolean,
    p_payment_method text,
    p_payment_date date,
    p_invoice_id text,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_member public.members%rowtype;
    v_plan public.plans%rowtype;
    v_payment_id uuid;
    v_start date;
    v_expiry date;
    v_status text;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('renew_member', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    if p_has_paid and (p_payment_date is null or p_payment_method is null) then
        raise exception 'Payment method and date are required';
    end if;
    if p_has_paid and (p_invoice_id is null or btrim(p_invoice_id) = '') then raise exception 'Invoice ID is required'; end if;
    if p_has_paid and p_payment_date > current_date then raise exception 'Payment date cannot be in the future'; end if;

    select * into v_member from public.members where id = p_member_id for update;
    if not found then raise exception 'Member not found'; end if;
    if v_member.status = 'pending' or v_member.access_state in ('blocked', 'cancelled') then
        raise exception 'Pending, blocked, or cancelled members cannot be renewed';
    end if;

    select * into v_plan from public.plans where id = p_plan_id and is_active = true;
    if not found then raise exception 'Active membership plan not found'; end if;

    v_start := case
        when v_member.expiry_date is not null and v_member.expiry_date > current_date then v_member.expiry_date
        else current_date
    end;
    v_expiry := v_start + v_plan.duration_days;
    v_status := case when p_has_paid then 'active' else 'approved' end;

    update public.members
    set plan_id = v_plan.id, join_date = v_start, expiry_date = v_expiry, status = v_status
    where id = v_member.id;

    if p_has_paid then
        insert into public.payments (
            member_id, plan_id, amount, mode, method, status, date, invoice_id
        ) values (
            v_member.id, v_plan.id, v_plan.price,
            case when p_payment_method = 'online' then 'online' else 'offline' end,
            p_payment_method, 'completed', p_payment_date, p_invoice_id
        ) returning id into v_payment_id;
    end if;

    v_response := jsonb_build_object(
        'id', v_member.id,
        'status', v_status,
        'plan_id', v_plan.id,
        'plan_name', v_plan.name,
        'join_date', v_start,
        'expiry_date', v_expiry,
        'payment_recorded', p_has_paid,
        'payment_id', v_payment_id
    );
    perform public.financial_idempotency_store(
        'renew_member', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

create or replace function public.financial_create_refund(
    p_payment_id uuid,
    p_amount numeric,
    p_reason text,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_payment public.payments%rowtype;
    v_refund public.refunds%rowtype;
    v_reserved numeric;
    v_refunds_enabled boolean;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('create_refund', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    select refunds_enabled into v_refunds_enabled from public.settings order by created_at limit 1;
    if coalesce(v_refunds_enabled, true) = false then raise exception 'Refunds are currently disabled'; end if;
    if p_amount <= 0 then raise exception 'Refund amount must be greater than zero'; end if;
    select * into v_payment from public.payments where id = p_payment_id for update;
    if not found then raise exception 'Payment not found'; end if;
    if v_payment.status <> 'completed' then raise exception 'Only completed payments can be refunded'; end if;

    select coalesce(sum(amount), 0) into v_reserved
    from public.refunds
    where payment_id = v_payment.id and status in ('pending', 'approved');
    if v_reserved + p_amount > v_payment.amount then
        raise exception 'Refund amount cannot exceed the refundable balance of %', v_payment.amount - v_reserved;
    end if;

    insert into public.refunds (member_id, payment_id, amount, reason)
    values (v_payment.member_id, v_payment.id, p_amount, p_reason)
    returning * into v_refund;

    v_response := to_jsonb(v_refund);
    perform public.financial_idempotency_store(
        'create_refund', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

create or replace function public.financial_resolve_refund(
    p_refund_id uuid,
    p_status text,
    p_idempotency_key uuid,
    p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_refund public.refunds%rowtype;
    v_payment public.payments%rowtype;
    v_approved numeric;
    v_refunds_enabled boolean;
    v_replayed boolean;
    v_response jsonb;
begin
    select replayed, stored_response into v_replayed, v_response
    from public.financial_idempotency_replay('resolve_refund', p_idempotency_key, p_request_hash);
    if v_replayed then return v_response; end if;

    select refunds_enabled into v_refunds_enabled from public.settings order by created_at limit 1;
    if coalesce(v_refunds_enabled, true) = false then raise exception 'Refunds are currently disabled'; end if;
    if p_status not in ('approved', 'rejected') then raise exception 'Refund status must be approved or rejected'; end if;
    select * into v_refund from public.refunds where id = p_refund_id for update;
    if not found then raise exception 'Refund not found'; end if;
    if v_refund.status <> 'pending' then raise exception 'Only pending refunds can be resolved'; end if;

    select * into v_payment from public.payments where id = v_refund.payment_id for update;
    if not found then raise exception 'Payment not found'; end if;

    if p_status = 'approved' then
        select coalesce(sum(amount), 0) into v_approved
        from public.refunds
        where payment_id = v_payment.id and status = 'approved';
        if v_approved + v_refund.amount > v_payment.amount then
            raise exception 'Approving this refund would exceed the payment amount';
        end if;
    else
        v_approved := 0;
    end if;

    update public.refunds
    set status = p_status, resolved_date = current_date
    where id = v_refund.id
    returning * into v_refund;

    if p_status = 'approved' and v_approved + v_refund.amount >= v_payment.amount then
        update public.payments set status = 'refunded' where id = v_payment.id;
    end if;

    v_response := to_jsonb(v_refund);
    perform public.financial_idempotency_store(
        'resolve_refund', p_idempotency_key, p_request_hash, v_response
    );
    return v_response;
end;
$$;

revoke all on function public.financial_idempotency_replay(text, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_idempotency_store(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.financial_request_payment(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_create_payment(uuid, uuid, numeric, text, text, text, date, text, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_confirm_payment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_reject_payment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_activate_member(uuid, uuid, date, boolean, text, date, text, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_renew_member(uuid, uuid, boolean, text, date, text, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_create_refund(uuid, numeric, text, uuid, text) from public, anon, authenticated;
revoke all on function public.financial_resolve_refund(uuid, text, uuid, text) from public, anon, authenticated;

grant execute on function public.financial_idempotency_replay(text, uuid, text) to service_role;
grant execute on function public.financial_idempotency_store(text, uuid, text, jsonb) to service_role;
grant execute on function public.financial_request_payment(uuid, uuid, text, text, uuid, text) to service_role;
grant execute on function public.financial_create_payment(uuid, uuid, numeric, text, text, text, date, text, uuid, text) to service_role;
grant execute on function public.financial_confirm_payment(uuid, uuid, text) to service_role;
grant execute on function public.financial_reject_payment(uuid, uuid, text) to service_role;
grant execute on function public.financial_activate_member(uuid, uuid, date, boolean, text, date, text, uuid, text) to service_role;
grant execute on function public.financial_renew_member(uuid, uuid, boolean, text, date, text, uuid, text) to service_role;
grant execute on function public.financial_create_refund(uuid, numeric, text, uuid, text) to service_role;
grant execute on function public.financial_resolve_refund(uuid, text, uuid, text) to service_role;

comment on table public.financial_idempotency_keys is
    'Server-only replay protection for atomic financial RPCs; prune rows older than the operational retry window.';
