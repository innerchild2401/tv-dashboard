-- Analytics every 15 minutes and TikTok once an hour.
-- The routes are idempotent and take no secret. If pg_cron or pg_net
-- is not installed, this migration leaves the routes unwired.

do $$
declare
  job_name text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  foreach job_name in array array['tv-dashboard-analytics', 'tv-dashboard-tiktok']
  loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
  end loop;

  perform cron.schedule(
    'tv-dashboard-analytics',
    '*/15 * * * *',
    $job$
    select net.http_get(
      url := 'https://tv-dashboard-sigma-one.vercel.app/api/cron/analytics',
      timeout_milliseconds := 15000
    );
    $job$
  );

  perform cron.schedule(
    'tv-dashboard-tiktok',
    '0 * * * *',
    $job$
    select net.http_get(
      url := 'https://tv-dashboard-sigma-one.vercel.app/api/cron/tiktok',
      timeout_milliseconds := 15000
    );
    $job$
  );
end
$$;
