-- One switch per account: does the mascot play its animations by itself?
--
-- REVIEW FIRST, then run in the Supabase SQL editor. Not run automatically.
-- Run AFTER add_profile_flags.sql. Additive and safe to run twice.
--
--   heart  true  = the mascot plays by itself: it starts with the heart, then
--                  goes on with the other animations.
--          false = it never plays by itself. (It still answers a direct click or
--                  a pointer resting on it.)
--
-- Existing rows default to true, so nobody already added changes behaviour.
-- It also removes the two earlier option columns (enabled, heart_only) if they
-- were created; the app no longer reads them.

begin;

alter table public.profile_flags
  add column if not exists heart boolean not null default true;

alter table public.profile_flags
  drop column if exists enabled,
  drop column if exists heart_only;

-- Check: the heart column exists.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profile_flags'
order by ordinal_position;

commit;
