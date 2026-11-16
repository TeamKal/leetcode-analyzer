-- REVIEW BEFORE RUNNING. Not executed by Claude. Run manually in the Supabase SQL editor.
-- Requires extensions pg_cron, pg_net and Supabase Vault.
--
-- 1) Store the endpoint URL and the dedicated secret in Vault.
--    Replace the placeholders in the SQL editor ONLY. Never commit real values.
--    Use the CLEANUP_CRON_SECRET value (not the evaluation secret).
--
-- select vault.create_secret('https://<your-production-domain>/api/cron/video-cleanup', 'video_cleanup_url');
-- select vault.create_secret('<CLEANUP_CRON_SECRET value>', 'video_cleanup_secret');
--
-- To rotate later: select vault.update_secret(id, '<new value>') for the row in vault.secrets.

-- 2) Schedule: every 5 minutes, one job per invocation.
select cron.schedule(
  'video-cleanup',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'video_cleanup_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'video_cleanup_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- 3) Enqueue due jobs directly in the database (no HTTP, no secret needed).
--    Requires video_cleanup_rpcs.sql to have been run first.
select cron.schedule(
  'video-cleanup-enqueue',
  '*/15 * * * *',
  $$ select public.enqueue_due_video_cleanup_jobs(100); $$
);

-- Pause / remove:
-- select cron.unschedule('video-cleanup');
-- select cron.unschedule('video-cleanup-enqueue');
