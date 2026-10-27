-- Read-only diagnostic queries for LinkDrop.
-- Run in the Supabase SQL Editor for the target project.
-- These queries inspect metadata; they do not modify application data.

-- 1. Actual columns and types for core tables.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'posts',
    'resources',
    'submissions',
    'admin_users',
    'profiles',
    'moderation_reviews',
    'reward_ledger',
    'audit_logs'
  )
order by table_name, ordinal_position;

-- 2. Relevant database functions and their exact signatures.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'review_linkdrop_submission',
    'consume_rate_limit'
  )
order by p.proname;

-- 3. RLS status for relevant public tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'posts',
    'resources',
    'submissions',
    'admin_users',
    'profiles',
    'moderation_reviews',
    'reward_ledger',
    'audit_logs'
  )
order by c.relname;

-- 4. Policies on the relevant tables.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'posts',
    'resources',
    'submissions',
    'admin_users',
    'profiles',
    'moderation_reviews',
    'reward_ledger',
    'audit_logs'
  )
order by tablename, policyname;

-- 5. Constraints and indexes relevant to duplicate submissions and publication.
select
  table_name,
  constraint_name,
  constraint_type
from information_schema.table_constraints
where table_schema = 'public'
  and table_name in ('posts', 'resources', 'submissions', 'admin_users')
order by table_name, constraint_type, constraint_name;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('posts', 'resources', 'submissions', 'admin_users')
order by tablename, indexname;

-- 6. Enum labels used by application status fields.
select
  t.typname as enum_name,
  e.enumsortorder,
  e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by t.typname, e.enumsortorder;
