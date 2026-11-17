-- Stop students reading their own submission data straight from the database.
--
-- Why: the transcript must not be available to students. Row-level security
-- currently lets a student SELECT their own rows in submissions (which includes
-- the transcript), evaluations (whose scores include quotes from the transcript),
-- mentor_grades and evaluation_jobs. The student pages in the app now read these
-- on the server with a fixed list of safe fields, so the direct access is no
-- longer needed and is removed here.
--
-- Not affected: mentors and admins keep their own policies. Students keep
-- "Students can view their own enrollment" on public.students (the app needs it
-- to recognise a student). The server (service role) bypasses these policies.
--
-- Review, then run in the Supabase SQL editor. Not run automatically.
-- Safe to re-run (uses IF EXISTS).

-- 1) Preview: the student policies that will be dropped.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and policyname in (
    'Students can view their own submissions',
    'Students can view their own evaluations',
    'Students can view their own grades',
    'Students can view their own evaluation jobs'
  )
order by tablename;

begin;

drop policy if exists "Students can view their own submissions" on public.submissions;
drop policy if exists "Students can view their own evaluations" on public.evaluations;
drop policy if exists "Students can view their own grades" on public.mentor_grades;
drop policy if exists "Students can view their own evaluation jobs" on public.evaluation_jobs;

commit;

-- 2) Check: no student SELECT policy remains on these tables (expect 0 rows),
--    and mentor/admin policies are still there.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('submissions', 'evaluations', 'mentor_grades', 'evaluation_jobs')
  and policyname like 'Students can%';

select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('submissions', 'evaluations', 'mentor_grades', 'evaluation_jobs')
  and (policyname like 'Mentors can%' or policyname like 'Admins can%')
order by tablename, policyname;
