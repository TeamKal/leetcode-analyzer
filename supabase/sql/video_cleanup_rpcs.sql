-- REVIEW BEFORE RUNNING. Not executed by Claude. Run manually in the Supabase SQL editor.
--
-- Adds what the existing cleanup RPCs lack:
--   1. enqueue_due_video_cleanup_jobs: nothing currently creates video_cleanup_jobs rows.
--   2. get_video_cleanup_job_context: claim_video_cleanup_job returns only
--      (job_id, submission_id, object_key, attempt_number), with no student_id,
--      status, retention deadline or deleted flag. The route needs those to
--      re-check eligibility BEFORE deleting from R2.
--   3. Execute grants: SECURITY DEFINER functions in `public` are executable by
--      anon/authenticated by default unless revoked. Worker RPCs must be
--      service_role only.
--
-- Cleanup only touches video_cleanup_jobs and submissions.video_deleted_at.
-- It never touches transcripts, evaluations, grades or submission rows.

-- 1) Enqueue due jobs (idempotent: skips submissions that already have any job;
--    failed jobs are re-queued via the existing admin retry_failed_video_cleanup_job).
create or replace function public.enqueue_due_video_cleanup_jobs(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
    inserted_count integer;
begin
    if p_limit is null or p_limit < 1 or p_limit > 1000 then
        raise exception 'Limit must be between 1 and 1000';
    end if;

    with due as (
        select s.id
        from public.submissions s
        where s.status in ('evaluated', 'graded')
          and s.video_delete_after is not null
          and s.video_delete_after <= now()
          and s.video_deleted_at is null
          and not exists (
              select 1 from public.video_cleanup_jobs j
              where j.submission_id = s.id
          )
        order by s.video_delete_after
        limit p_limit
        for update of s skip locked
    ),
    inserted as (
        insert into public.video_cleanup_jobs (submission_id)
        select d.id from due d
        on conflict do nothing
        returning id
    )
    select count(*)::integer into inserted_count from inserted;

    return inserted_count;
end;
$function$;

-- Recommended (guards against double-enqueue). First check for duplicates:
--   select submission_id, count(*) from public.video_cleanup_jobs group by 1 having count(*) > 1;
-- If none:
--   create unique index if not exists video_cleanup_jobs_submission_id_key
--     on public.video_cleanup_jobs (submission_id);

-- 2) Eligibility context for a job the caller owns (read-only).
create or replace function public.get_video_cleanup_job_context(p_job_id uuid, p_worker_id text)
returns table (
    student_id uuid,
    video_object_key text,
    submission_status text,
    video_delete_after timestamptz,
    video_deleted_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
    select s.student_id, s.video_object_key, s.status,
           s.video_delete_after, s.video_deleted_at
    from public.video_cleanup_jobs j
    join public.submissions s on s.id = j.submission_id
    where j.id = p_job_id
      and j.status = 'processing'
      and j.locked_by = trim(p_worker_id);
$function$;

-- 3) Lock worker RPCs down to service_role. retry_failed_video_cleanup_job is
--    intentionally NOT listed: it is an admin RPC checked via auth.uid()/is_admin().
revoke all on function public.enqueue_due_video_cleanup_jobs(integer) from public, anon, authenticated;
revoke all on function public.get_video_cleanup_job_context(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_video_cleanup_job(text) from public, anon, authenticated;
revoke all on function public.complete_video_cleanup_job(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_video_cleanup_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.recover_stale_video_cleanup_jobs(integer) from public, anon, authenticated;
revoke all on function public.renew_video_cleanup_job_lease(uuid, text) from public, anon, authenticated;

grant execute on function public.enqueue_due_video_cleanup_jobs(integer) to service_role;
grant execute on function public.get_video_cleanup_job_context(uuid, text) to service_role;
grant execute on function public.claim_video_cleanup_job(text) to service_role;
grant execute on function public.complete_video_cleanup_job(uuid, text) to service_role;
grant execute on function public.fail_video_cleanup_job(uuid, text, text) to service_role;
grant execute on function public.recover_stale_video_cleanup_jobs(integer) to service_role;
grant execute on function public.renew_video_cleanup_job_lease(uuid, text) to service_role;

-- Verify afterwards (expect only postgres/service_role to hold EXECUTE):
--   select p.proname, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like '%video_cleanup%';
