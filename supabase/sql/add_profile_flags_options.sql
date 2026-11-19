-- Two switches per account on the private flags table.
--
-- REVIEW FIRST, then run in the Supabase SQL editor. Not run automatically.
-- Run AFTER add_profile_flags.sql. It is additive and safe to run twice: it only
-- adds two columns with defaults, so existing rows keep working exactly as now
-- (enabled, full set).
--
--   enabled     true  = the account gets the extras, false = switched off
--               (the row stays, so it can be turned back on).
--   heart_only  true  = only the heart animation, false = the full set.
--
-- The app reads these on the server. Until this file is run, the app treats every
-- existing row as enabled with the full set.

begin;

alter table public.profile_flags
  add column if not exists enabled boolean not null default true,
  add column if not exists heart_only boolean not null default false;

-- Check: both columns exist.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profile_flags'
order by ordinal_position;

commit;
