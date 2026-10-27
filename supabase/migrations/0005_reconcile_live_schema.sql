-- LinkDrop 0005: reconcile the verified live schema with the application.
-- Preconditions: the live posts/resources/submissions schema was inspected and all
-- three tables were empty. This migration refuses to proceed if submissions exist.
-- Apply once in the Supabase SQL Editor; do not run the previous draft of 0005.

begin;

-- Existing live submissions only have id/resource_id/verification_method/
-- moderation_status/created_at. Do not silently reinterpret legacy rows.
do $$
begin
  if exists (select 1 from public.submissions limit 1) then
    raise exception 'LinkDrop 0005 stopped: submissions is not empty; migrate existing rows deliberately first';
  end if;
end;
$$;

-- Account status lookup used by the server. No browser policies are created.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- Explicit admin allowlist. This migration does not grant anyone admin access.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  disabled_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  notes text null check (notes is null or char_length(notes) <= 500)
);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;
create index if not exists admin_users_active_idx
  on public.admin_users (user_id) where disabled_at is null;

-- Add the application's submission contract without dropping legacy fields.
alter table public.submissions
  add column if not exists post_id uuid references public.posts(id) on delete cascade,
  add column if not exists submitted_by uuid references auth.users(id) on delete restrict,
  add column if not exists resource_url text,
  add column if not exists normalized_resource_url text,
  add column if not exists resource_type text,
  add column if not exists description text,
  add column if not exists status text;

-- Pending submissions do not have a resource row yet, so resource_id must be nullable.
alter table public.submissions alter column resource_id drop not null;

-- This migration deliberately requires an empty submissions table before making
-- these fields mandatory. The check above prevents data loss/backfill ambiguity.
alter table public.submissions
  alter column post_id set not null,
  alter column submitted_by set not null,
  alter column resource_url set not null,
  alter column normalized_resource_url set not null,
  alter column resource_type set not null,
  alter column status set default 'pending',
  alter column status set not null;

alter table public.submissions
  drop constraint if exists submissions_status_check;
alter table public.submissions
  add constraint submissions_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- Preserve the existing legacy moderation_status constraint by writing it in tandem.
create index if not exists submissions_pending_queue_idx
  on public.submissions (created_at asc) where status = 'pending';
create unique index if not exists submissions_one_pending_resource_idx
  on public.submissions (post_id, normalized_resource_url) where status = 'pending';

-- Rate limit storage. Only the trusted server role may use this table/function.
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists rate_limit_buckets_expiry_idx
  on public.rate_limit_buckets (expires_at);
alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.rate_limit_buckets%rowtype;
begin
  if p_bucket_key is null or pg_catalog.length(p_bucket_key) < 8 or pg_catalog.length(p_bucket_key) > 200 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_key';
  end if;
  if p_max_requests < 1 or p_max_requests > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_parameters';
  end if;

  insert into public.rate_limit_buckets(bucket_key, window_started_at, request_count, expires_at, updated_at)
  values (p_bucket_key, v_now, 0, v_now + pg_catalog.make_interval(secs => p_window_seconds), v_now)
  on conflict (bucket_key) do nothing;

  select b.* into v_row
  from public.rate_limit_buckets b
  where b.bucket_key = p_bucket_key
  for update;

  if v_row.window_started_at + pg_catalog.make_interval(secs => p_window_seconds) <= v_now then
    update public.rate_limit_buckets b
    set window_started_at = v_now,
        request_count = 1,
        expires_at = v_now + pg_catalog.make_interval(secs => p_window_seconds),
        updated_at = v_now
    where b.bucket_key = p_bucket_key;
    return query select true, p_max_requests - 1, v_now + pg_catalog.make_interval(secs => p_window_seconds);
    return;
  end if;

  if v_row.request_count >= p_max_requests then
    return query select false, 0, v_row.window_started_at + pg_catalog.make_interval(secs => p_window_seconds);
    return;
  end if;

  update public.rate_limit_buckets b
  set request_count = b.request_count + 1, updated_at = v_now
  where b.bucket_key = p_bucket_key;

  return query select true, p_max_requests - v_row.request_count - 1,
    v_row.window_started_at + pg_catalog.make_interval(secs => p_window_seconds);
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Moderation history is append-only from the application's perspective.
create table if not exists public.moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  review_note text null check (review_note is null or char_length(review_note) <= 1000),
  resource_id uuid null references public.resources(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists moderation_reviews_submission_idx
  on public.moderation_reviews (submission_id, created_at desc);
alter table public.moderation_reviews enable row level security;
revoke all on table public.moderation_reviews from anon, authenticated;
grant select, insert on table public.moderation_reviews to service_role;

create or replace function public.prevent_moderation_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'moderation_review_is_immutable';
end;
$$;
drop trigger if exists moderation_reviews_immutable on public.moderation_reviews;
create trigger moderation_reviews_immutable
before update or delete on public.moderation_reviews
for each row execute function public.prevent_moderation_review_mutation();

-- Atomic review. Resource status must be 'active': the live resources check
-- constraint allows pending/active/disputed/removed, not 'published'.
create or replace function public.review_linkdrop_submission(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text default null
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

  return pg_catalog.jsonb_build_object(
    'submissionId', v_submission.id,
    'status', v_new_status,
    'reviewId', v_review_id,
    'resourceId', v_resource_id
  );
end;
$$;
revoke all on function public.review_linkdrop_submission(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_linkdrop_submission(uuid, uuid, text, text) to service_role;

commit;
