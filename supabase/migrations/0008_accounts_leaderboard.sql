-- LinkDrop 0008: username accounts, count-based live leaderboard, promo slots.
--
-- Owner model (confirmed 2026-10-27):
--   * NO points, NO rewards earning. The leaderboard ranks contributors by the
--     NUMBER of GENUINE links that are live right now (status = 'active' and
--     not demo), attributed to their account. Rejects, reports, and permanent
--     removals automatically drop out of the count — no side-ledger to keep
--     in sync, the count is computed live from the same rows users see.
--   * Accounts are username + password only (no email) — the auth email is
--     synthesized as <username>@users.linkdrop.internal and never exposed.
--   * Top-of-the-leaderboard names may promote their own ad through the
--     promotion_requests flow, subject to owner approval and guidelines; a
--     slot stays live for ~24h AND only while the user is still on top.
--   * Reuses the 0006 ledger machinery untouched (dormant), per the earlier
--     "dormant, not deleted" decision.
--
-- Safe to re-run.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Usernames on profiles. NULL username = legacy account (still fine to use
--    with requireUser; it just is never ranked or shown on the leaderboard).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text,
  add column if not exists username_created_ip_hash text,
  add column if not exists username_created_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'profiles_username_shape') then
    alter table public.profiles
      add constraint profiles_username_shape
      check (username is null or username ~ '^[a-z0-9_]{3,20}$');
  end if;
end $$;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username);

alter table public.profiles
  add constraint profiles_username_ip_hash_length check (username_created_ip_hash is null or pg_catalog.char_length(username_created_ip_hash) <= 64);

-- Fast live-link counting per contributor.
create index if not exists resources_submitter_status_idx
  on public.resources (submitted_by, status)
  where submitted_by is not null;

-- ---------------------------------------------------------------------------
-- 2. public_leaderboard_top: genuine current live links per username.
--    Ties: earlier first link wins, then alphabetical — fully deterministic.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_top(p_limit integer default 50)
returns table (
  position integer,
  user_id uuid,
  username text,
  live_links bigint,
  first_link_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with counts as (
    select
      p.user_id,
      p.username,
      pg_catalog.count(r.id) as live,
      pg_catalog.min(r.created_at) as first_at
    from public.profiles p
    join public.resources r
      on r.submitted_by = p.user_id
     and r.status = 'active'
     and r.is_demo = false
    where p.username is not null
    group by p.user_id, p.username
  )
  select
    pg_catalog.row_number() over (order by c.live desc, c.first_at asc, c.username asc)::integer as position,
    c.user_id,
    c.username,
    c.live as live_links,
    c.first_at as first_link_at
  from counts c
  where c.live > 0
  order by position
  limit pg_catalog.greatest(pg_catalog.least(pg_catalog.coalesce(p_limit, 50), 100), 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. public_stats: honest, real numbers for the home page counters.
-- ---------------------------------------------------------------------------
create or replace function public.public_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resources pg_catalog.int8;
  v_posts pg_catalog.int8;
  v_last timestamptz;
begin
  select pg_catalog.count(*) into v_resources
  from public.resources where status = 'active' and is_demo = false;

  select pg_catalog.count(distinct post_id) into v_posts
  from public.resources where status = 'active' and is_demo = false;

  select pg_catalog.max(created_at) into v_last
  from public.resources where status = 'active' and is_demo = false;

  return pg_catalog.jsonb_build_object(
    'activeResources', v_resources,
    'postsCovered', v_posts,
    'lastAddedAt', v_last
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. contributor_rank: the single definition of promo eligibility.
--    rank <= p_top_n AND live_links >= p_min_links  =>  eligible.
-- ---------------------------------------------------------------------------
create or replace function public.contributor_rank(
  p_user_id uuid,
  p_top_n integer default 3,
  p_min_links integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
  v_rank integer;
  v_username text;
begin
  select p.username into v_username
  from public.profiles p
  where p.user_id = p_user_id and p.username is not null;
  if not found then
    return pg_catalog.jsonb_build_object('rank', null, 'liveLinks', 0, 'eligible', false, 'reason', 'no_username');
  end if;

  select pg_catalog.count(*) into v_count
  from public.resources
  where submitted_by = p_user_id and status = 'active' and is_demo = false;

  if v_count = 0 then
    return pg_catalog.jsonb_build_object('rank', null, 'liveLinks', 0, 'eligible', false, 'reason', 'no_live_links');
  end if;

  -- Rank = everyone strictly ahead in live count + 1 (inclusive ties).
  select 1 + pg_catalog.count(*) into v_rank from (
    select
      s.user_id,
      pg_catalog.count(r.id) as c
    from public.profiles s
    join public.resources r
      on r.submitted_by = s.user_id
     and r.status = 'active'
     and r.is_demo = false
    where s.username is not null
    group by s.user_id
  ) board
  where board.c > v_count;

  return pg_catalog.jsonb_build_object(
    'rank', v_rank,
    'liveLinks', v_count,
    'eligible', v_rank <= p_top_n and v_count >= p_min_links
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. submit_public_link: same behaviour, plus optional account attribution.
--    Recreated (drop + create) so exactly ONE signature exists — the app is
--    the only caller.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_public_link(text, text, text, text, text, text, text);

create or replace function public.submit_public_link(
  p_canonical_post_url text,
  p_post_code text,
  p_platform text,
  p_resource_url text,
  p_resource_type text,
  p_description text,
  p_submitter_ip_hash text,
  p_submitter_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
  v_resource_id uuid;
  v_submission_id uuid;
  v_existing uuid;
  v_source text;
begin
  if p_canonical_post_url is null or pg_catalog.char_length(p_canonical_post_url) = 0
     or pg_catalog.char_length(p_canonical_post_url) > 2048
     or p_post_code is null or pg_catalog.char_length(p_post_code) = 0
     or pg_catalog.char_length(p_post_code) > 60
     or p_platform <> 'instagram'
     or p_resource_url is null or pg_catalog.left(p_resource_url, 8) <> 'https://'
     or pg_catalog.char_length(p_resource_url) > 4096
     or p_resource_type is null
     or p_resource_type not in ('preset', 'template', 'pdf', 'document', 'project_file', 'software', 'course', 'tutorial', 'other')
     or p_submitter_ip_hash is null or pg_catalog.char_length(p_submitter_ip_hash) > 64 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_description is not null and pg_catalog.char_length(p_description) > 500 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  -- Attribution only lands if the caller is a real, active, username account.
  v_source := 'anonymous';
  if p_submitter_id is not null then
    perform 1 from public.profiles
    where user_id = p_submitter_id and account_status = 'active' and username is not null;
    if not found then
      raise exception using errcode = '22023', message = 'invalid_submitter';
    end if;
    v_source := 'account';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_canonical_post_url || '|' || p_resource_url, 0)
  );

  if not exists (
    select 1 from public.admin_users a where a.disabled_at is null limit 1
  ) then
    raise exception using errcode = '55000', message = 'no_admin_configured';
  end if;

  insert into public.posts (platform, canonical_url, platform_post_id, canonical_post_id)
  values (p_platform, p_canonical_post_url, p_post_code, p_post_code)
  on conflict (platform, canonical_url)
  do update set last_seen_at = now()
  returning id into v_post_id;

  select id into v_existing
  from public.resources
  where post_id = v_post_id
    and normalized_resource_url = p_resource_url
    and status <> 'removed'
  limit 1;

  if found then
    return pg_catalog.jsonb_build_object(
      'status', case when (select status from public.resources where id = v_existing) = 'active'
                     then 'already_listed' else 'on_hold' end,
      'resourceId', v_existing
    );
  end if;

  insert into public.resources (
    post_id, resource_url, normalized_resource_url, resource_type, description, status, submitted_by
  ) values (
    v_post_id, p_resource_url, p_resource_url, p_resource_type,
    nullif(p_description, ''), 'active', p_submitter_id
  ) returning id into v_resource_id;

  update public.resources
  set is_demo = false,
      submitted_ip_hash = p_submitter_ip_hash
  where id = v_resource_id;

  insert into public.submissions (
    post_id, submitted_by, resource_url, normalized_resource_url,
    resource_type, description, status, resource_id, verification_method,
    moderation_status, source, submitted_ip_hash
  ) values (
    v_post_id, p_submitter_id, p_resource_url, p_resource_url, p_resource_type,
    nullif(p_description, ''), 'approved', v_resource_id, 'community_submission',
    'approved', v_source, p_submitter_ip_hash
  ) returning id into v_submission_id;

  insert into public.audit_logs (action, entity_type, entity_id, reason_code, safe_metadata)
  values ('public_resource_published', 'resources', v_resource_id, v_source || '_submission',
          jsonb_build_object('postId', v_post_id, 'submissionId', v_submission_id, 'attributed', p_submitter_id is not null));

  return pg_catalog.jsonb_build_object(
    'status', 'published',
    'resourceId', v_resource_id,
    'postId', v_post_id,
    'submissionId', v_submission_id,
    'attributed', p_submitter_id is not null
  );
end;
$$;

revoke all on function public.submit_public_link(text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_public_link(text, text, text, text, text, text, text, uuid)
  to service_role;

revoke all on function public.leaderboard_top(integer) from public, anon, authenticated;
grant execute on function public.leaderboard_top(integer) to service_role;

revoke all on function public.public_stats() from public, anon, authenticated;
grant execute on function public.public_stats() to service_role;

revoke all on function public.contributor_rank(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.contributor_rank(uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Promotion requests: winners of the leaderboard paste their own ad, the
--    owner approves it, and it renders until it expires AND while they stay
--    on top. One pending or one approved request per user at a time.
-- ---------------------------------------------------------------------------
create table if not exists public.promotion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  headline text not null check (pg_catalog.char_length(pg_catalog.btrim(headline)) between 1 and 80),
  detail text check (detail is null or pg_catalog.char_length(detail) <= 200),
  target_url text not null check (pg_catalog.left(target_url, 8) = 'https://' and pg_catalog.char_length(target_url) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'retired')),
  owner_note text check (owner_note is null or pg_catalog.char_length(owner_note) <= 500),
  active_until timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger promotion_requests_updated_at before update on public.promotion_requests
  for each row execute function public.set_updated_at();

create unique index if not exists promotion_requests_one_pending_idx
  on public.promotion_requests (user_id) where status = 'pending';
create unique index if not exists promotion_requests_one_approved_idx
  on public.promotion_requests (user_id) where status = 'approved';
create index if not exists promotion_requests_queue_idx
  on public.promotion_requests (status, created_at);

alter table public.promotion_requests enable row level security;
revoke all on table public.promotion_requests from anon, authenticated;
grant select, insert, update on table public.promotion_requests to service_role;

-- User submits their own ad (only eligible users pass the DB-side check).
create or replace function public.submit_promotion(
  p_user_id uuid,
  p_headline text,
  p_detail text,
  p_target_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank jsonb;
  v_headline text;
begin
  v_headline := pg_catalog.btrim(coalesce(p_headline, ''));
  if pg_catalog.char_length(v_headline) < 1 or pg_catalog.char_length(v_headline) > 80 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_detail is not null and pg_catalog.char_length(p_detail) > 200 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_target_url is null or pg_catalog.left(p_target_url, 8) <> 'https://' or pg_catalog.char_length(p_target_url) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if exists (
    select 1 from public.promotion_requests
    where user_id = p_user_id and status = 'pending'
  ) then
    return pg_catalog.jsonb_build_object('status', 'already_pending');
  end if;

  if exists (
    select 1 from public.promotion_requests
    where user_id = p_user_id
      and status = 'approved'
      and active_until is not null
      and active_until > now()
  ) then
    return pg_catalog.jsonb_build_object('status', 'already_live');
  end if;

  v_rank := public.contributor_rank(p_user_id);
  if not coalesce((v_rank ->> 'eligible')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'status', 'not_eligible',
      'rank', v_rank ->> 'rank',
      'liveLinks', v_rank ->> 'liveLinks'
    );
  end if;

  insert into public.promotion_requests (user_id, headline, detail, target_url)
  values (p_user_id, v_headline, nullif(p_detail, ''), p_target_url);

  insert into public.audit_logs (actor_id, action, entity_type, reason_code, safe_metadata)
  values (p_user_id, 'promotion_requested', 'promotion_requests', 'submitted',
          jsonb_build_object('liveLinks', v_rank ->> 'liveLinks', 'rank', v_rank ->> 'rank'));

  return pg_catalog.jsonb_build_object('status', 'submitted');
end;
$$;

revoke all on function public.submit_promotion(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_promotion(uuid, text, text, text) to service_role;

-- Owner decision: approve/reject/retire/extend.
create or replace function public.admin_promotion_decide(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_note text default null,
  p_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.promotion_requests%rowtype;
  v_until timestamptz;
begin
  if p_action not in ('approve', 'reject', 'retire', 'extend') then
    raise exception using errcode = '22023', message = 'invalid_action';
  end if;
  if p_note is not null and pg_catalog.char_length(p_note) > 500 then
    raise exception using errcode = '22023', message = 'note_too_long';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then
    p_hours := 24;
  end if;

  perform 1 from public.admin_users a
  where a.user_id = p_reviewer_id and a.disabled_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select * into v_row from public.promotion_requests
  where id = p_request_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'request_not_found';
  end if;

  -- Close any of this user's expired-but-still-'approved' rows BEFORE acting,
  -- so a fresh approval cannot collide with the one-approved-per-user index.
  update public.promotion_requests
  set status = 'rejected',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      owner_note = coalesce(owner_note, 'Auto-closed: the promo window expired.')
  where status = 'approved'
    and active_until is not null
    and active_until <= now()
    and user_id = (select user_id from public.promotion_requests where id = p_request_id);

  if p_action = 'approve' then
    v_until := now() + make_interval(hours => p_hours);
    update public.promotion_requests
    set status = 'approved', active_until = v_until, reviewed_by = p_reviewer_id,
        reviewed_at = now(), owner_note = nullif(p_note, '')
    where id = p_request_id;
  elsif p_action = 'reject' then
    update public.promotion_requests
    set status = 'rejected', reviewed_by = p_reviewer_id,
        reviewed_at = now(), owner_note = nullif(p_note, '')
    where id = p_request_id;
  elsif p_action = 'retire' then
    update public.promotion_requests
    set status = 'retired', active_until = null, reviewed_by = p_reviewer_id,
        reviewed_at = now()
    where id = p_request_id;
  else -- extend
    if v_row.status <> 'approved' then
      raise exception using errcode = '22023', message = 'not_approvable';
    end if;
    v_until := now() + make_interval(hours => p_hours);
    update public.promotion_requests
    set active_until = greatest(coalesce(active_until, now()), v_until),
        reviewed_by = p_reviewer_id, reviewed_at = now(), owner_note = nullif(p_note, '')
    where id = p_request_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason_code, safe_metadata)
  values (p_reviewer_id, 'promotion_' || p_action, 'promotion_requests', p_request_id,
          jsonb_build_object('note', p_note, 'hours', p_hours));

  return pg_catalog.jsonb_build_object('status', p_action, 'activeUntil', case when p_action in ('approve', 'extend') then v_until end);
end;
$$;

revoke all on function public.admin_promotion_decide(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_promotion_decide(uuid, uuid, text, text, integer) to service_role;

-- The home-page slot: latest approved promo, rendered ONLY while the user is
-- still inside the top contributors (and inside their active window).
create or replace function public.active_promotion(
  p_top_n integer default 3,
  p_min_links integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_rank jsonb;
begin
  select
    pr.id, pr.user_id, pr.headline, pr.detail, pr.target_url,
    p.username, pr.active_until
  into v_row
  from public.promotion_requests pr
  join public.profiles p on p.user_id = pr.user_id
  where pr.status = 'approved'
    and pr.active_until is not null
    and pr.active_until > now()
  order by pr.active_until desc, pr.updated_at desc
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object('active', false);
  end if;

  v_rank := public.contributor_rank(v_row.user_id, p_top_n, p_min_links);
  if not coalesce((v_rank ->> 'eligible')::boolean, false) then
    return pg_catalog.jsonb_build_object('active', false, 'vacatedBy', v_row.username);
  end if;

  return pg_catalog.jsonb_build_object(
    'active', true,
    'username', v_row.username,
    'headline', v_row.headline,
    'detail', v_row.detail,
    'targetUrl', v_row.target_url,
    'activeUntil', v_row.active_until
  );
end;
$$;

revoke all on function public.active_promotion(integer, integer) from public, anon, authenticated;
grant execute on function public.active_promotion(integer, integer) to service_role;

commit;
