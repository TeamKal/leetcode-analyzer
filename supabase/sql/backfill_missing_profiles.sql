-- Backfill profiles for Google accounts that signed in but have no profile row.
--
-- Why: the app decides access from public.profiles. A signed-in account with no
-- profile row is shown "Access could not be verified" (/access-denied), even if
-- the person is enrolled as a student. The on_auth_user_created trigger normally
-- creates the row; this adds it for accounts where that did not happen.
--
-- Safe to re-run: it only inserts missing rows, never changes existing ones, and
-- always creates them with the lowest role ('student'). It does not touch
-- public.students (the student's enrollment is linked on their next sign-in).
--
-- Review, then run in the Supabase SQL editor. Not run automatically.

-- 1) Preview: accounts that would get a profile.
select u.id, u.email, u.email_confirmed_at is not null as confirmed
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at;

-- 2) Create the missing profiles (same defaults as handle_new_user()).
insert into public.profiles (id, full_name, email, role)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(u.email, '@', 1)
  ),
  u.email,
  'student'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 3) Check: every auth user now has a profile (expect 0 rows).
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
