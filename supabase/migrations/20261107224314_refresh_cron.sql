-- Call the production refresh routes. They are idempotent and take no secret.
-- A stale read of /api/state refreshes the same data if a job is missed.
-- pg_net starts the request after this transaction commits.

create extension if not exists pg_net;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

grant all privileges on all tables in schema cron to postgres;

do $$
declare
  job_name text;
begin
  foreach job_name in array array['tv-dashboard-calendar', 'tv-dashboard-weather']
  loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
  end loop;
end
$$;

select cron.schedule(
  'tv-dashboard-calendar',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://tv-dashboard-sigma-one.vercel.app/api/cron/calendar',
    timeout_milliseconds := 15000
  );
  $$
);

select cron.schedule(
  'tv-dashboard-weather',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := 'https://tv-dashboard-sigma-one.vercel.app/api/cron/weather',
    timeout_milliseconds := 15000
  );
  $$
);
