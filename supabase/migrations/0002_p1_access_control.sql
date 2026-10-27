-- LinkDrop P1: explicit administrator access control.
-- Apply after the P0 schema in a development Supabase project first.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  note text
);

alter table public.admin_users enable row level security;
-- No client policies. Admin grants are managed only by trusted server/database operators.

create index if not exists admin_users_active_idx
  on public.admin_users(user_id)
  where disabled_at is null;

comment on table public.admin_users is
  'Server-checked administrator allowlist. Never expose service-role credentials to clients.';
