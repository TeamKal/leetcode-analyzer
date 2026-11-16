-- REVIEW BEFORE RUNNING. Not executed by Claude. Run manually in the Supabase SQL editor.
--
-- Per-student limit on server-side (Deepgram) transcriptions, so a single
-- account cannot burn the provider credit. Rolling 24-hour window.
-- The route reserves a slot BEFORE calling Deepgram (fails closed), so failed
-- provider calls also count; the route passes the limit (currently 10).
--
-- Until this file is run, /api/transcription returns 503 (fails closed).

create table if not exists public.transcription_usage (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students(id) on delete cascade,
    object_key text not null,
    created_at timestamptz not null default now()
);

create index if not exists transcription_usage_student_created_idx
    on public.transcription_usage (student_id, created_at desc);

-- RLS on with no policies: only the service role (which bypasses RLS) can touch it.
alter table public.transcription_usage enable row level security;
revoke all on table public.transcription_usage from anon, authenticated;

create or replace function public.reserve_transcription_slot(
    p_student_id uuid,
    p_object_key text,
    p_daily_limit integer
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
    used_count integer;
begin
    if p_student_id is null
       or NULLIF(TRIM(p_object_key), '') is null
       or p_daily_limit is null
       or p_daily_limit < 1
       or p_daily_limit > 1000
    then
        raise exception 'Invalid transcription slot request';
    end if;

    -- Serialize concurrent requests for the same student so parallel calls
    -- cannot all pass the count check before any of them records a row.
    perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

    select count(*)::integer
    into used_count
    from public.transcription_usage
    where student_id = p_student_id
      and created_at > now() - interval '24 hours';

    if used_count >= p_daily_limit then
        return false;
    end if;

    insert into public.transcription_usage (student_id, object_key)
    values (p_student_id, p_object_key);

    return true;
end;
$function$;

revoke all on function public.reserve_transcription_slot(uuid, text, integer)
    from public, anon, authenticated;
grant execute on function public.reserve_transcription_slot(uuid, text, integer)
    to service_role;

-- Optional housekeeping (rows older than 7 days are not needed):
--   delete from public.transcription_usage where created_at < now() - interval '7 days';
