-- Let a class's mentor retry a failed AI evaluation (admins still can).
--
-- Why: public.retry_failed_evaluation(p_job_id) only allowed admins. The mentor
-- dashboard now has a "Try again" button for failed evaluations, so the mentor
-- who owns the student's class must be allowed too. Everything else is unchanged:
-- only a job that is 'failed' on a submission that is 'failed' and has no
-- successful evaluation can be requeued, and its attempts are reset.
--
-- Review, then run in the Supabase SQL editor. Not run automatically.
-- Safe to re-run (CREATE OR REPLACE with the same signature and grants).

create or replace function public.retry_failed_evaluation(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid;
    is_current_admin boolean;
    current_job record;
begin
    current_user_id := auth.uid();

    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    is_current_admin := public.is_admin();

    if not is_current_admin and not public.is_mentor() then
        raise exception 'Only admins and mentors can retry failed evaluations';
    end if;

    if p_job_id is null then
        raise exception 'Job ID is required';
    end if;

    select
        j.id,
        j.submission_id,
        j.status as job_status,
        s.status as submission_status,
        c.mentor_id as class_mentor_id
    into current_job
    from public.evaluation_jobs j
    join public.submissions s on s.id = j.submission_id
    join public.students st on st.id = s.student_id
    join public.classes c on c.id = st.class_id
    where j.id = p_job_id
    for update of j, s;

    -- A mentor only gets "not found" for jobs outside their own classes.
    if not found
       or (not is_current_admin and current_job.class_mentor_id is distinct from current_user_id)
    then
        raise exception 'Evaluation job not found';
    end if;

    if current_job.job_status <> 'failed'
       or current_job.submission_status <> 'failed'
    then
        raise exception 'Only failed evaluations can be retried';
    end if;

    if exists (
        select 1
        from public.evaluations
        where submission_id = current_job.submission_id
    ) then
        raise exception 'A successful evaluation already exists';
    end if;

    update public.evaluation_jobs
    set
        status = 'pending',
        attempt_count = 0,
        locked_at = null,
        locked_by = null,
        last_error = null,
        updated_at = now()
    where id = p_job_id;

    update public.submissions
    set
        status = 'pending_evaluation',
        updated_at = now()
    where id = current_job.submission_id;

    return jsonb_build_object(
        'success', true,
        'message', 'Evaluation queued for retry',
        'job_id', p_job_id,
        'submission_id', current_job.submission_id
    );
end;
$function$;

-- Check: the function exists and is callable by signed-in users (as before).
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'retry_failed_evaluation';
