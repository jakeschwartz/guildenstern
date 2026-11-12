-- Run scan-calendar every 30 minutes; it only does work for a household at
-- its local 8am and 5pm (and not twice within 5 hours). Otis's questions
-- stay stored-but-unposted until post_questions is turned on here.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'scan-calendar') then
    perform cron.unschedule('scan-calendar');
  end if;
  perform cron.schedule(
    'scan-calendar',
    '12,42 * * * *',
    $cron$
      select net.http_post(
        url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/scan-calendar',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{"post_questions": false}'::jsonb,
        timeout_milliseconds := 150000
      );
    $cron$
  );
end $$;
