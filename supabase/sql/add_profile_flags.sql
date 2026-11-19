-- Per-account switches that only the server can read.
--
-- REVIEW FIRST, then run in the Supabase SQL editor. Not run automatically.
-- It only creates an empty table; it grants nothing to anyone.
--
-- The app's server reads this table with the service role. The browser roles
-- (anon, authenticated) get no access at all: RLS is on, there are no policies,
-- and the table privileges are revoked, so it cannot be listed or guessed from
-- a signed-in session or from the public API.
--
-- Runs in one transaction and ends with ROLLBACK: the first run only shows the
-- result. Change the final "rollback;" to "commit;" to keep it.

begin;

create table if not exists public.profile_flags (
  user_id uuid not null references public.profiles (id) on delete cascade,
  flag text not null check (flag ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, flag)
);

alter table public.profile_flags enable row level security;

revoke all on public.profile_flags from anon, authenticated;

-- Check: RLS on, and no browser role can read it. Expected: one row, rls = true.
select c.relname as table_name, c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profile_flags';

select has_table_privilege('anon', 'public.profile_flags', 'select') as anon_can_read,
       has_table_privilege('authenticated', 'public.profile_flags', 'select') as authenticated_can_read;

-- Change this to "commit;" once the checks above show rls = true and both false.
rollback;
