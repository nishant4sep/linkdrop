-- LinkDrop P2.1: explicit admin access foundation.
-- Review against the existing schema before applying to any non-empty project.
-- This migration does not grant admin access to any user automatically.

begin;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  disabled_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  notes text null check (notes is null or char_length(notes) <= 500)
);

comment on table public.admin_users is
  'Server-checked allowlist of LinkDrop administrators. A row grants access only while disabled_at is null.';
comment on column public.admin_users.user_id is
  'Supabase Auth user UUID. Never use a client-supplied user ID as proof of authorization.';
comment on column public.admin_users.disabled_at is
  'Non-null disables administrator access without deleting the audit trail.';

alter table public.admin_users enable row level security;

-- Intentionally create no anon/authenticated policies. Browser clients must not
-- be able to enumerate, grant, or revoke administrative privileges.
revoke all on table public.admin_users from anon, authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;

create index if not exists admin_users_active_idx
  on public.admin_users (user_id)
  where disabled_at is null;

commit;
