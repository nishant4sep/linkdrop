-- LinkDrop P1.2
-- Apply only after verifying the P0/P1 schema contract in a development database.

create table if not exists public.moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  review_note text,
  resource_id uuid references public.resources(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint moderation_reviews_note_length check (review_note is null or char_length(review_note) <= 1000)
);

create index if not exists moderation_reviews_submission_idx
  on public.moderation_reviews(submission_id, created_at desc);

alter table public.moderation_reviews enable row level security;
-- No client-facing policies: read/write via authorized server routes only.

create or replace function public.prevent_moderation_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'moderation review history is append-only';
end;
$$;

drop trigger if exists moderation_reviews_no_update on public.moderation_reviews;
create trigger moderation_reviews_no_update
before update or delete on public.moderation_reviews
for each row execute function public.prevent_moderation_review_mutation();

-- Defense in depth against concurrent duplicate publication.
create unique index if not exists resources_one_published_url_per_post_idx
  on public.resources(post_id, resource_url)
  where status = 'published';

-- Defense in depth against concurrent duplicate pending submissions.
create unique index if not exists submissions_one_pending_url_per_post_idx
  on public.submissions(post_id, normalized_resource_url)
  where status = 'pending';

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_expiry_idx
  on public.rate_limit_buckets(expires_at);

alter table public.rate_limit_buckets enable row level security;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_max_requests integer
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
    raise exception 'invalid rate limit key';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 or p_max_requests < 1 or p_max_requests > 10000 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.rate_limit_buckets(bucket_key, window_started_at, request_count, expires_at, updated_at)
  values (p_bucket_key, v_now, 1, v_now + pg_catalog.make_interval(secs => p_window_seconds), v_now)
  on conflict (bucket_key) do nothing;

  select * into v_row
  from public.rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if v_row.window_started_at + pg_catalog.make_interval(secs => p_window_seconds) <= v_now then
    update public.rate_limit_buckets
    set window_started_at = v_now,
        request_count = 1,
        expires_at = v_now + pg_catalog.make_interval(secs => p_window_seconds),
        updated_at = v_now
    where bucket_key = p_bucket_key;
    return query select true, p_max_requests - 1, v_now + pg_catalog.make_interval(secs => p_window_seconds);
    return;
  end if;

  if v_row.request_count > p_max_requests then
    return query select false, 0, v_row.window_started_at + pg_catalog.make_interval(secs => p_window_seconds);
    return;
  end if;

  if v_row.request_count = p_max_requests then
    update public.rate_limit_buckets
    set request_count = request_count + 1, updated_at = v_now
    where bucket_key = p_bucket_key;
    return query select false, 0, v_row.window_started_at + pg_catalog.make_interval(secs => p_window_seconds);
    return;
  end if;

  update public.rate_limit_buckets
  set request_count = request_count + 1, updated_at = v_now
  where bucket_key = p_bucket_key;

  return query select true, p_max_requests - v_row.request_count - 1,
    v_row.window_started_at + pg_catalog.make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Atomic decision: lock submission, check current admin grant, create resource if approved,
-- update submission state and append review history in the same transaction.
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
  v_resource_id uuid;
  v_review_id uuid;
  v_new_status text;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'invalid_decision';
  end if;
  if p_review_note is not null and pg_catalog.char_length(p_review_note) > 1000 then
    raise exception using errcode = '22023', message = 'review_note_too_long';
  end if;

  perform 1
  from public.admin_users a
  where a.user_id = p_reviewer_id
    and a.disabled_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select * into v_submission
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'submission_not_found';
  end if;
  if v_submission.status <> 'pending' then
    raise exception using errcode = '55000', message = 'submission_already_reviewed';
  end if;

  if p_decision = 'approve' then
    insert into public.resources(
      post_id, resource_url, resource_type, description, status
    ) values (
      v_submission.post_id,
      v_submission.normalized_resource_url,
      v_submission.resource_type,
      v_submission.description,
      'published'
    ) returning id into v_resource_id;

    v_new_status := 'approved';
  else
    v_new_status := 'rejected';
  end if;

  update public.submissions
  set status = v_new_status
  where id = v_submission.id;

  insert into public.moderation_reviews(
    submission_id, reviewer_id, decision, review_note, resource_id
  ) values (
    v_submission.id, p_reviewer_id, v_new_status, nullif(pg_catalog.btrim(p_review_note), ''), v_resource_id
  ) returning id into v_review_id;

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

comment on function public.review_linkdrop_submission(uuid, uuid, text, text) is
  'Atomically approves or rejects a pending submission. Called only by trusted server code after auth verification.';
