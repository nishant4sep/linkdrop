-- LinkDrop 0001: core schema for a FRESH project (recreated 2026-10-27).
--
-- The original P0 migration was lost in a baseline shuffle; this file
-- restores the foundational schema verbatim from the schema.sql draft so a
-- brand-new Supabase project can stand up from empty. On an ALREADY-migrated
-- database (burner/testing project) do NOT run this again -- the later
-- migrations 0002-0008 reconcile it into the live application shape.
--
-- Apply order: 0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006 -> 0007 -> 0008.

-- LinkDrop foundational schema
-- Apply to a fresh Supabase project. Keep privileged writes on the trusted server.

create extension if not exists pgcrypto;

create type public.platform_type as enum ('instagram');
create type public.resource_status as enum ('pending', 'active', 'stale', 'disputed', 'quarantined', 'removed');
create type public.submission_status as enum ('received', 'validating', 'awaiting_review', 'approved', 'rejected', 'quarantined');
create type public.verification_outcome as enum ('passed', 'failed', 'uncertain', 'skipped');
create type public.review_decision as enum ('approved', 'rejected', 'needs_evidence', 'quarantined');
create type public.reward_entry_type as enum ('earn', 'adjustment', 'reversal', 'redeem', 'refund');
create type public.reward_entry_status as enum ('pending', 'posted', 'voided');
create type public.redemption_status as enum ('requested', 'under_review', 'approved', 'processing', 'paid', 'rejected', 'cancelled');
create type public.moderation_case_status as enum ('open', 'investigating', 'resolved', 'dismissed');

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

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Contributor' check (char_length(display_name) between 1 and 40),
  account_status text not null default 'active' check (account_status in ('active', 'restricted', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private account and risk information must not be placed in public profile fields.
create table public.contributor_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  risk_state text not null default 'normal' check (risk_state in ('normal', 'review', 'restricted')),
  notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  platform public.platform_type not null default 'instagram',
  canonical_post_id text not null,
  canonical_url text not null,
  original_url text,
  creator_handle text,
  post_type text check (post_type is null or post_type in ('reel', 'post', 'carousel', 'unknown')),
  identity_confidence text not null default 'unverified' check (identity_confidence in ('unverified', 'probable', 'verified')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, canonical_post_id)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete restrict,
  resource_url text not null,
  normalized_resource_url text not null,
  resource_type text not null default 'unknown' check (resource_type in ('preset', 'template', 'pdf', 'document', 'project_file', 'software', 'course', 'product', 'other', 'unknown')),
  title text,
  description text,
  status public.resource_status not null default 'pending',
  version_number integer not null default 1 check (version_number > 0),
  submitted_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_check_result text check (last_check_result is null or last_check_result in ('reachable', 'unreachable', 'blocked', 'uncertain')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, normalized_resource_url, version_number)
);

create index resources_public_lookup_idx on public.resources (post_id, status);
create index resources_revalidation_idx on public.resources (next_check_at) where status = 'active';

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete restrict,
  proposed_post_url text not null,
  proposed_resource_url text not null,
  normalized_post_key text,
  normalized_resource_key text,
  resource_type text not null default 'unknown',
  title text,
  contributor_id uuid not null references auth.users(id) on delete restrict,
  resource_id uuid references public.resources(id) on delete restrict,
  status public.submission_status not null default 'received',
  submission_note text,
  rejection_reason_code text,
  reward_eligibility text not null default 'undetermined' check (reward_eligibility in ('undetermined', 'eligible', 'ineligible', 'under_review')),
  received_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index submissions_contributor_idx on public.submissions (contributor_id, created_at desc);
create index submissions_review_queue_idx on public.submissions (status, received_at);
create index submissions_duplicate_lookup_idx on public.submissions (normalized_post_key, normalized_resource_key);

create table public.submission_evidence (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('public_page', 'creator_page', 'resource_page', 'authorized_message', 'manual_note', 'other')),
  evidence_url text,
  evidence_summary text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  visibility text not null default 'restricted' check (visibility in ('restricted', 'reviewer_only')),
  created_at timestamptz not null default now()
);

create table public.verification_runs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  checker_name text not null,
  checker_version text not null,
  outcome public.verification_outcome not null,
  checks jsonb not null default '{}'::jsonb,
  safe_to_open boolean,
  mapping_supported boolean,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index verification_runs_submission_idx on public.verification_runs (submission_id, started_at desc);

create table public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  reviewer_id uuid references auth.users(id) on delete set null,
  decision public.review_decision not null,
  reason_code text not null,
  reviewer_note text,
  independent_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.resource_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  resource_url text not null,
  normalized_resource_url text not null,
  change_reason text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (resource_id, version_number)
);

create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references auth.users(id) on delete restrict,
  submission_id uuid references public.submissions(id) on delete restrict,
  entry_type public.reward_entry_type not null,
  status public.reward_entry_status not null default 'pending',
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

create index reward_ledger_contributor_idx on public.reward_ledger (contributor_id, created_at desc);
create index reward_ledger_status_idx on public.reward_ledger (status, created_at);

create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references auth.users(id) on delete restrict,
  unit text not null check (unit in ('points', 'INR')),
  amount numeric(14, 2) not null check (amount > 0),
  status public.redemption_status not null default 'requested',
  idempotency_key text not null unique,
  payout_reference text,
  decision_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create index reward_redemptions_queue_idx on public.reward_redemptions (status, requested_at);

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null check (case_type in ('fraud', 'resource_report', 'rights_request', 'contributor_appeal', 'security_incident', 'other')),
  status public.moderation_case_status not null default 'open',
  submission_id uuid references public.submissions(id) on delete restrict,
  resource_id uuid references public.resources(id) on delete restrict,
  subject_user_id uuid references auth.users(id) on delete set null,
  opened_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  reason_code text not null,
  restricted_details jsonb not null default '{}'::jsonb,
  resolution_code text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index moderation_cases_queue_idx on public.moderation_cases (status, opened_at);

create table public.audit_logs (
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

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create table public.outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outbox_jobs_ready_idx on public.outbox_jobs (status, available_at) where status in ('queued', 'failed');

-- Keep updated_at consistent for mutable operational tables.
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger contributor_private_updated_at before update on public.contributor_private for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();
create trigger resources_updated_at before update on public.resources for each row execute function public.set_updated_at();
create trigger submissions_updated_at before update on public.submissions for each row execute function public.set_updated_at();
create trigger reward_redemptions_updated_at before update on public.reward_redemptions for each row execute function public.set_updated_at();
create trigger moderation_cases_updated_at before update on public.moderation_cases for each row execute function public.set_updated_at();
create trigger outbox_jobs_updated_at before update on public.outbox_jobs for each row execute function public.set_updated_at();

-- Prevent mutation of financial-style history. Corrections use compensating entries.
create or replace function public.reject_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'This history table is append-only';
end;
$$;

create trigger reward_ledger_append_only before update or delete on public.reward_ledger for each row execute function public.reject_history_mutation();
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.reject_history_mutation();
create trigger resource_versions_append_only before update or delete on public.resource_versions for each row execute function public.reject_history_mutation();
create trigger verification_runs_append_only before update or delete on public.verification_runs for each row execute function public.reject_history_mutation();
create trigger verification_reviews_append_only before update or delete on public.verification_reviews for each row execute function public.reject_history_mutation();

-- Default-deny client access. Trusted server operations must use a server-only credential
-- and must still perform explicit authorization checks before every privileged operation.
alter table public.profiles enable row level security;
alter table public.contributor_private enable row level security;
alter table public.posts enable row level security;
alter table public.resources enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_evidence enable row level security;
alter table public.verification_runs enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.resource_versions enable row level security;
alter table public.reward_ledger enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.audit_logs enable row level security;
alter table public.outbox_jobs enable row level security;

-- No client policies are intentionally created in this foundation migration.
-- Public lookup and contributor access will be exposed through narrowly scoped server APIs.
-- Never expose the Supabase service-role key in browser code or public environment variables.

