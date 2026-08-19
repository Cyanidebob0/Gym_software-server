-- Data Principal requests (DPDP Act 2023)
--
-- Backs the rights the Privacy Policy promises but the product could not
-- previously honour:
--   * Section 6(4) — withdrawing consent must be as easy as giving it
--   * Section 11   — right to access a summary of data held
--   * Section 12   — right to correction, completion and erasure
--   * Section 13 / Rule 17 — a grievance mechanism the Data Principal must be
--     able to exhaust before complaining to the Data Protection Board, which
--     means requests and their outcomes have to be logged, not just emailed.
--
-- Requests are recorded rather than actioned automatically: erasure in
-- particular must be refused where retention is legally required (payment and
-- invoice records), so a human decides and the reason is written down.

create table if not exists data_requests (
    id uuid primary key default gen_random_uuid(),
    member_id uuid references members(id) on delete set null,
    user_id uuid not null,
    -- 'withdraw_consent' covers the consent-based processing only; membership
    -- and financial records continue under Section 7 legitimate uses.
    kind text not null check (kind in ('access', 'correction', 'erasure', 'withdraw_consent')),
    details text,
    status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'rejected')),
    -- What the gym did and why. Required reading if a request is ever escalated
    -- to the Board, and the reason a refusal must be explained.
    response text,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create index if not exists data_requests_user_idx on data_requests (user_id, created_at desc);
create index if not exists data_requests_open_idx on data_requests (status, created_at) where status in ('open', 'in_progress');

comment on table data_requests is
    'Data Principal rights requests under the DPDP Act 2023. Retain the response text: it is the record that the grievance mechanism under Section 13 was actually operated.';
