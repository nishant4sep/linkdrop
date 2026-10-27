-- LinkDrop 0007: the pivot to an anonymous, SEO-first directory.
--
-- Model decisions (owner, 2026-10-27):
--   * Removing links requires no account. Anonymous contributions publish
--     IMMEDIATELY (retro-moderation) and are auto-hidden the moment a single,
--     distinct person reports the resource ("disputed" state, resolvers never
--     serve non-active rows). The owner can reinstate or remove from console.
--   * IPs are only ever stored as salted hashes — never raw addresses.
--   * A first report quarantines the link; IP blocking stays a human decision
--     in the console (CG-NAT makes blanket auto IP bans unusable).
--   * The cash payout system stays in 0006 tables but is switched OFF by
--     default in the app; loyalty accounting will reuse the same ledger later.
--
-- Safe to re-run on both schema shapes.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Relax ownership: submissions may now be anonymous.
--    The live table was reconciled by 0005 with submitted_by NOT NULL; it was
--    empty at that time and submissions are only created through the trusted
--    server, so relaxing is safe. New provenance columns keep the trail.
-- ---------------------------------------------------------------------------
alter table public.submissions
  alter column submitted_by drop not null,
  add column if not exists submitted_ip_hash text,
  add column if not exists source text not null default 'account'
    check (source in ('anonymous', 'account')),
  add column if not exists is_demo boolean not null default false;

alter table public.resources
  add column if not exists submitted_ip_hash text,
  add column if not exists is_demo boolean not null default false;

alter table public.posts
  add column if not exists is_demo boolean not null default false,
  -- Base-schema shape compatibility: the draft table keys posts by
  -- canonical_post_id (NOT NULL) while the app writes platform_post_id. Both
  -- worlds end up with both columns, and submit_public_link writes both.
  add column if not exists canonical_post_id text,
  -- Freshness signal for the sitemap and the submit upsert; missing on the
  -- live table today, so it must be created here (0005 never touched posts).
  add column if not exists last_seen_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Reports: one row per resource+visitor (unique) drives auto-quarantine.
-- ---------------------------------------------------------------------------
create table if not exists public.resource_reports (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_ip_hash text not null,
  reason text not null
    check (reason in ('fraud', 'dead_link', 'explicit', 'copyright', 'other')),
  details text,
  status text not null default 'unread'
    check (status in ('unread', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  constraint resource_reports_details_length check (char_length(details) <= 500)
);

create unique index if not exists resource_reports_unique_visitor_idx
  on public.resource_reports (resource_id, reporter_ip_hash);
create index if not exists resource_reports_unread_idx
  on public.resource_reports (resource_id, status, created_at);

alter table public.resource_reports enable row level security;
revoke all on table public.resource_reports from anon, authenticated;
grant select, insert, update on table public.resource_reports to service_role;

-- ---------------------------------------------------------------------------
-- 3. submit_public_link: the anonymous instant-publish path.
--    Runs as service role (SECURITY DEFINER), re-validates everything, and
--    serializes per (post, resource) pair so concurrent first submissions can
--    not produce duplicates: creator inserts first, loser retries as a lookup.
-- ---------------------------------------------------------------------------
create or replace function public.submit_public_link(
  p_canonical_post_url text,
  p_post_code text,
  p_platform text,
  p_resource_url text,
  p_resource_type text,
  p_description text,
  p_submitter_ip_hash text
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
begin
  -- Server-trusted inputs still verified inside the database.
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

  -- Serialize any race for the same resource on the same post.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_canonical_post_url || '|' || p_resource_url, 0)
  );

  if not exists (
    select 1 from public.admin_users a where a.disabled_at is null limit 1
  ) then
    raise exception using errcode = '55000', message = 'no_admin_configured';
  end if;

  -- Post registration: 0006 guarantees a unique index on (platform, canonical_url).
  insert into public.posts (platform, canonical_url, platform_post_id, canonical_post_id)
  values (p_platform, p_canonical_post_url, p_post_code, p_post_code)
  on conflict (platform, canonical_url)
  do update set last_seen_at = now()
  returning id into v_post_id;

  -- Duplicate protection across statuses.
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
    post_id, resource_url, normalized_resource_url, resource_type, description, status
  ) values (
    v_post_id, p_resource_url, p_resource_url, p_resource_type,
    nullif(p_description, ''), 'active'
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
    v_post_id, null, p_resource_url, p_resource_url, p_resource_type,
    nullif(p_description, ''), 'approved', v_resource_id, 'community_submission',
    'approved', 'anonymous', p_submitter_ip_hash
  ) returning id into v_submission_id;

  insert into public.audit_logs (action, entity_type, entity_id, reason_code, safe_metadata)
  values ('public_resource_published', 'resources', v_resource_id, 'anonymous_submission',
          jsonb_build_object('postId', v_post_id, 'submissionId', v_submission_id));

  return pg_catalog.jsonb_build_object(
    'status', 'published',
    'resourceId', v_resource_id,
    'postId', v_post_id,
    'submissionId', v_submission_id
  );
end;
$$;
revoke all on function public.submit_public_link(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_public_link(text, text, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. report_resource: one distinct visitor report quarantines the resource.
-- ---------------------------------------------------------------------------
create or replace function public.report_resource(
  p_resource_id uuid,
  p_reporter_id uuid,
  p_reporter_ip_hash text,
  p_reason text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_reason not in ('fraud', 'dead_link', 'explicit', 'copyright', 'other') then
    raise exception using errcode = '22023', message = 'invalid_reason';
  end if;
  if p_reporter_ip_hash is null or pg_catalog.char_length(p_reporter_ip_hash) > 64 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_details is not null and pg_catalog.char_length(p_details) > 500 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if not exists (select 1 from public.resources where id = p_resource_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  insert into public.resource_reports (
    resource_id, reporter_id, reporter_ip_hash, reason, details
  ) values (
    p_resource_id, p_reporter_id, p_reporter_ip_hash, p_reason, nullif(p_details, '')
  )
  on conflict (resource_id, reporter_ip_hash) do nothing
  returning true into v_status;

  if v_status then
    -- Fresh reporter: quarantine the resource immediately (owner review follows).
    update public.resources
    set status = 'disputed'
    where id = p_resource_id and status = 'active';

    return pg_catalog.jsonb_build_object('acknowledged', true, 'hidden', true);
  end if;

  return pg_catalog.jsonb_build_object('acknowledged', true, 'hidden', false);
end;
$$;
revoke all on function public.report_resource(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.report_resource(uuid, uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. admin_resolve_report: owner reviews a quarantined resource.
--    'reinstate' → active again; 'remove' → permanently delisted.
-- ---------------------------------------------------------------------------
create or replace function public.admin_resolve_report(
  p_resource_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_status text;
begin
  if p_action not in ('reinstate', 'remove') then
    raise exception using errcode = '22023', message = 'invalid_action';
  end if;
  if p_note is not null and pg_catalog.char_length(p_note) > 500 then
    raise exception using errcode = '22023', message = 'note_too_long';
  end if;

  perform 1 from public.admin_users a
  where a.user_id = p_reviewer_id and a.disabled_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if not exists (select 1 from public.resources where id = p_resource_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  v_new_status := case when p_action = 'reinstate' then 'active' else 'removed' end;

  update public.resources
  set status = v_new_status
  where id = p_resource_id;

  update public.resource_reports
  set status = case when p_action = 'reinstate' then 'dismissed' else 'actioned' end
  where resource_id = p_resource_id and status = 'unread';

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason_code, safe_metadata)
  values (p_reviewer_id,
          case when p_action = 'reinstate' then 'report_reinstated' else 'report_removed' end,
          'resources', p_resource_id, p_action, jsonb_build_object('note', p_note));

  return pg_catalog.jsonb_build_object('status', v_new_status);
end;
$$;
revoke all on function public.admin_resolve_report(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_resolve_report(uuid, uuid, text, text) to service_role;

commit;
