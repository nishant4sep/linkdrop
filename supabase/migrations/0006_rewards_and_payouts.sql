-- LinkDrop 0006: reward earning, payout (redemption) management, and hardening.
-- Apply once, after 0005. Safe to re-run (IF NOT EXISTS / create-or-replace)
-- and safe on BOTH schema shapes:
--   * A fresh database where supabase/schema.sql ran first: every table exists
--     already (enum-typed) and the statements below are no-ops.
--   * The live database built from migrations 0002->0005 only: the enum types
--     and the financial tables never existed there, so this migration builds
--     them text+CHECK instead (the enums are intentionally NOT referenced).
--
-- Model (per docs/P3_REWARD_LEDGER_AND_INVARIANTS.md):
--  * reward_ledger is append-only: every transition is a NEW row (idempotency_key unique).
--  * Approving a submission posts one 'earn' entry. Replays are no-ops via the unique key.
--  * A redemption row is the reservation: while the row is requested/under_review/
--    approved/processing the amount is held and subtracted from the usable balance.
--  * Paying a redemption marks the row 'paid' AND posts one immutable 'redeem' ledger
--    entry (linked to the redemption). Outstanding hold drops, posted debit rises:
--    total balance math is invariant across the transition.
--  * Rejecting a redemption only drops the outstanding hold. No ledger entry: reserved
--    credit simply returns.
--  * Every balance mutation is: ledger-posted entries +/- outstanding redemption rows.
--
-- Client roles keep no DML access. All writes happen through service-role-only RPCs
-- that re-verify authorization inside the function (defense in depth).

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0a. Shared trigger functions (base-schema equivalents that may not exist
--     on the live migration-built database).
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.reject_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'This history table is append-only';
end;
$$;

-- ---------------------------------------------------------------------------
-- 0b. profiles compatibility: display_name is read by /api/me/profile and the
--     owner console. The 0005 live profiles table predates it.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name text not null default 'Contributor';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'profiles_display_name_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_display_name_check
      check (char_length(display_name) between 1 and 40);
  end if;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 0c. reward_ledger: the single source of truth for credit. Create it if the
--     base schema never did (the live migration-built database). TEXT + CHECK
--     mirrors the base enum semantics without depending on enum types.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references auth.users(id) on delete restrict,
  submission_id uuid references public.submissions(id) on delete restrict,
  entry_type text not null check (entry_type in ('earn', 'adjustment', 'reversal', 'redeem', 'refund')),
  status text not null default 'pending' check (status in ('pending', 'posted', 'voided')),
  unit text not null default 'points' check (unit in ('points', 'INR')),
  amount numeric(14, 2) not null check (amount > 0),
  idempotency_key text not null unique,
  rule_version text not null,
  explanation_code text not null,
  related_entry_id uuid references public.reward_ledger(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create index if not exists reward_ledger_contributor_idx
  on public.reward_ledger (contributor_id, created_at desc);
create index if not exists reward_ledger_status_idx
  on public.reward_ledger (status, created_at);

alter table public.reward_ledger enable row level security;
revoke all on table public.reward_ledger from anon, authenticated;
revoke update, delete on table public.reward_ledger from service_role;
grant select, insert on table public.reward_ledger to service_role;

-- Append-only enforced in the database, not just by convention or application code.
drop trigger if exists reward_ledger_append_only on public.reward_ledger;
create trigger reward_ledger_append_only
  before update or delete on public.reward_ledger
  for each row execute function public.reject_history_mutation();

-- ---------------------------------------------------------------------------
-- 0d. reward_redemptions: the payout request itself IS the reservation.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references auth.users(id) on delete restrict,
  unit text not null default 'points' check (unit in ('points', 'INR')),
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'requested'
    check (status in ('requested', 'under_review', 'approved', 'processing', 'paid', 'rejected', 'cancelled')),
  idempotency_key text not null unique,
  payout_reference text,
  decision_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists reward_redemptions_queue_idx
  on public.reward_redemptions (status, requested_at);

alter table public.reward_redemptions enable row level security;
revoke all on table public.reward_redemptions from anon, authenticated;
grant select, insert, update on table public.reward_redemptions to service_role;

-- A contributor may only have one redemption in flight at a time.
create unique index if not exists reward_redemptions_one_in_flight_idx
  on public.reward_redemptions (contributor_id)
  where status in ('requested', 'under_review', 'approved', 'processing');

drop trigger if exists reward_redemptions_updated_at on public.reward_redemptions;
create trigger reward_redemptions_updated_at
  before update on public.reward_redemptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 0e. audit_logs: owner console writes an audit trail for standing changes.
--     Insert-only for the server; append-only in the database.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  reason_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon, authenticated;
revoke update, delete on table public.audit_logs from service_role;
grant select, insert on table public.audit_logs to service_role;

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.reject_history_mutation();

-- Infrastructure commits first: even if a later part fails on re-run, the
-- financial foundation is durable and every statement here is idempotent.
commit;

-- ---------------------------------------------------------------------------
-- 0f. posts compatibility (separate, lower-stakes transaction): the application
--     upserts (platform_post_id, canonical_url) with onConflict(platform,
--     canonical_url). The base schema draft keyed posts by canonical_post_id
--     instead, and the live database may lack either piece. Both statements are
--     no-ops when the shape already matches. A redundant duplicate unique index
--     is harmless. If this transaction fails, only the submit upsert path is
--     affected; the moderation RPC below still pins to the previous signature.
-- ---------------------------------------------------------------------------
begin;

alter table public.posts
  add column if not exists platform_post_id text;

create unique index if not exists posts_platform_canonical_key
  on public.posts (platform, canonical_url);

commit;

begin;

-- ---------------------------------------------------------------------------
-- 1. Earning: extend the atomic submission review with reward posting.
--
--    Notes: the function is replaced with a new 5-arg signature (extra defaulted
--    parameter). The old 4-arg overload is dropped afterwards to avoid ambiguity.
-- ---------------------------------------------------------------------------
create or replace function public.review_linkdrop_submission(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text default null,
  p_reward_points numeric default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.submissions%rowtype;
  v_resource_id uuid := null;
  v_review_id uuid;
  v_new_status text;
  v_reward_amount numeric := least(greatest(p_reward_points, 0::numeric), 100000::numeric);
begin
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'invalid_decision';
  end if;
  if p_review_note is not null and pg_catalog.length(p_review_note) > 1000 then
    raise exception using errcode = '22023', message = 'review_note_too_long';
  end if;

  perform 1 from public.admin_users a
  where a.user_id = p_reviewer_id and a.disabled_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select s.* into v_submission
  from public.submissions s
  where s.id = p_submission_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'submission_not_found';
  end if;
  if v_submission.status <> 'pending' then
    raise exception using errcode = '55000', message = 'submission_already_reviewed';
  end if;

  if p_decision = 'approve' then
    if exists (
      select 1 from public.resources r
      where r.post_id = v_submission.post_id
        and r.normalized_resource_url = v_submission.normalized_resource_url
    ) then
      raise exception using errcode = '23505', message = 'resource_already_exists_for_post';
    end if;

    insert into public.resources(
      post_id, resource_url, normalized_resource_url, resource_type, description, status
    ) values (
      v_submission.post_id, v_submission.resource_url,
      v_submission.normalized_resource_url, v_submission.resource_type,
      v_submission.description, 'active'
    ) returning id into v_resource_id;
    v_new_status := 'approved';
  else
    v_new_status := 'rejected';
  end if;

  update public.submissions
  set status = v_new_status,
      moderation_status = v_new_status,
      resource_id = v_resource_id
  where id = v_submission.id;

  insert into public.moderation_reviews(submission_id, reviewer_id, decision, review_note, resource_id)
  values (v_submission.id, p_reviewer_id, v_new_status,
          nullif(pg_catalog.btrim(p_review_note), ''), v_resource_id)
  returning id into v_review_id;

  -- Reward: posted immediately on approval, fully idempotent by the unique key so
  -- a retry of the whole RPC can never double-credit.
  if p_decision = 'approve' and v_reward_amount > 0 then
    insert into public.reward_ledger(
      contributor_id, submission_id, entry_type, status, unit, amount,
      idempotency_key, rule_version, explanation_code, created_by, posted_at
    )
    values (
      v_submission.submitted_by, v_submission.id, 'earn', 'posted', 'points', v_reward_amount,
      'submission-approved:' || v_submission.id, 'v1', 'LINK_PUBLISHED', p_reviewer_id,
      pg_catalog.clock_timestamp()
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return pg_catalog.jsonb_build_object(
    'submissionId', v_submission.id,
    'status', v_new_status,
    'reviewId', v_review_id,
    'resourceId', v_resource_id,
    'rewardAwarded', (p_decision = 'approve' and v_reward_amount > 0)
  );
end;
$$;

-- Pin traffic to the new signature (service-role only, as before).
revoke all on function public.review_linkdrop_submission(uuid, uuid, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.review_linkdrop_submission(uuid, uuid, text, text, numeric)
  to service_role;
drop function if exists public.review_linkdrop_submission(uuid, uuid, text, text);

-- ---------------------------------------------------------------------------
-- 2. Balance math lives ONLY inside a SECURITY DEFINER function. The balance is
--    never stored in a column, so it can never drift from the events.
-- ---------------------------------------------------------------------------
create or replace function public.linkdrop_available_points(
  p_contributor_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_posted_add numeric;
  v_posted_subtract numeric;
  v_outstanding numeric;
begin
  select coalesce(sum(l.amount), 0) into v_posted_add
  from public.reward_ledger l
  where l.contributor_id = p_contributor_id
    and l.status = 'posted'
    and l.entry_type in ('earn', 'refund', 'adjustment');

  select coalesce(sum(l.amount), 0) into v_posted_subtract
  from public.reward_ledger l
  where l.contributor_id = p_contributor_id
    and l.status = 'posted'
    and l.entry_type in ('redeem', 'reversal');

  select coalesce(sum(r.amount), 0) into v_outstanding
  from public.reward_redemptions r
  where r.contributor_id = p_contributor_id
    and r.status in ('requested', 'under_review', 'approved', 'processing');

  return v_posted_add - v_posted_subtract - v_outstanding;
end;
$$;
revoke all on function public.linkdrop_available_points(uuid) from public, anon, authenticated;
grant execute on function public.linkdrop_available_points(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Contributor requests a payout. The reservation is atomic: the balance is
--    re-computed inside the same transaction under a per-contributor advisory
--    lock, so two concurrent requests can never overspend.
-- ---------------------------------------------------------------------------
create or replace function public.request_linkdrop_redemption(
  p_contributor_id uuid,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric;
  v_available numeric;
  v_row public.reward_redemptions%rowtype;
begin
  if p_amount is null then
    raise exception using errcode = '22023', message = 'invalid_amount';
  end if;
  v_amount := least(greatest(p_amount, 0::numeric), 100000::numeric);
  if v_amount < 1 or pg_catalog.floor(v_amount) <> v_amount then
    raise exception using errcode = '22023', message = 'invalid_amount';
  end if;
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) < 8
     or pg_catalog.length(p_idempotency_key) > 120 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;

  -- Only an active contributor in good standing may reserve credit.
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_contributor_id and p.account_status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'contributor_not_active';
  end if;

  -- Serialize all balance mutations per contributor.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_contributor_id::text, 0)
  );

  select * into v_row from public.reward_redemptions r
  where r.idempotency_key = p_idempotency_key;
  if found then
    if v_row.contributor_id <> p_contributor_id then
      raise exception using errcode = '22023', message = 'idempotency_key_owner_mismatch';
    end if;
    -- Replay: return the already-stored request instead of duplicating it.
    return pg_catalog.jsonb_build_object(
      'redemptionId', v_row.id, 'status', v_row.status,
      'amount', v_row.amount, 'availableAfter', null
    );
  end if;

  select public.linkdrop_available_points(p_contributor_id) into v_available;
  if v_amount > v_available then
    raise exception using errcode = '23514', message = 'insufficient_balance';
  end if;

  insert into public.reward_redemptions(
    contributor_id, unit, amount, status, idempotency_key
  )
  values (
    p_contributor_id, 'points', v_amount, 'requested', p_idempotency_key
  )
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'redemptionId', v_row.id, 'status', v_row.status,
    'amount', v_row.amount, 'availableAfter', v_available - v_amount
  );
end;
$$;
revoke all on function public.request_linkdrop_redemption(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.request_linkdrop_redemption(uuid, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Owner decisions on payouts. Re-verifies the admin allowlist inside the
--    function (defense in depth), locks the row, validates the transition.
-- ---------------------------------------------------------------------------
create or replace function public.review_linkdrop_redemption(
  p_redemption_id uuid,
  p_reviewer_id uuid,
  p_decision text,           -- 'pay' | 'process' | 'reject'
  p_decision_reason text default null,
  p_payout_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.reward_redemptions%rowtype;
  v_new_status text;
  v_clean_reason text;
  v_clean_reference text;
begin
  if p_decision not in ('pay', 'process', 'reject') then
    raise exception using errcode = '22023', message = 'invalid_decision';
  end if;
  if p_decision_reason is not null and pg_catalog.length(p_decision_reason) > 500 then
    raise exception using errcode = '22023', message = 'reason_too_long';
  end if;
  if p_payout_reference is not null and pg_catalog.length(p_payout_reference) > 200 then
    raise exception using errcode = '22023', message = 'reference_too_long';
  end if;
  if p_decision = 'reject' and nullif(pg_catalog.btrim(p_decision_reason), '') is null then
    raise exception using errcode = '22023', message = 'reject_requires_reason';
  end if;

  perform 1 from public.admin_users a
  where a.user_id = p_reviewer_id and a.disabled_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select r.* into v_row
  from public.reward_redemptions r
  where r.id = p_redemption_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'redemption_not_found';
  end if;

  -- 'pay' and 'process' and 'reject' are all allowed from any in-flight state.
  if v_row.status not in ('requested', 'under_review', 'approved', 'processing') then
    raise exception using errcode = '55000', message = 'redemption_already_settled';
  end if;

  if p_decision = 'pay' then
    v_new_status := 'paid';
  elsif p_decision = 'process' then
    v_new_status := 'processing';
  else
    v_new_status := 'rejected';
  end if;

  v_clean_reason := nullif(pg_catalog.btrim(p_decision_reason), '');
  v_clean_reference := nullif(pg_catalog.btrim(p_payout_reference), '');

  update public.reward_redemptions
  set status = v_new_status::public.redemption_status,
      reviewed_by = p_reviewer_id,
      decided_at = pg_catalog.clock_timestamp(),
      decision_reason = coalesce(v_clean_reason, decision_reason),
      payout_reference = coalesce(v_clean_reference, payout_reference)
  where id = p_redemption_id;

  -- Paying posts the irreversible ledger debit. The unique idempotency key makes
  -- a retry safe: the row transition above would fail first, and the insert's
  -- unique key additionally protects against a direct replay.
  if p_decision = 'pay' then
    insert into public.reward_ledger(
      contributor_id, entry_type, status, unit, amount,
      idempotency_key, rule_version, explanation_code, created_by, posted_at
    )
    values (
      v_row.contributor_id, 'redeem', 'posted', v_row.unit, v_row.amount,
      'redemption-paid:' || v_row.id, 'v1', 'PAYOUT_DELIVERED', p_reviewer_id,
      pg_catalog.clock_timestamp()
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'redemptionId', v_row.id, 'status', v_new_status, 'amount', v_row.amount
  );
end;
$$;
revoke all on function public.review_linkdrop_redemption(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.review_linkdrop_redemption(uuid, uuid, text, text, text) to service_role;

commit;
