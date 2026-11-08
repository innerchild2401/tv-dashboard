-- Simple TV rotation: fixed 120s dwell, drop Site/TikTok, equal round-robin pool.
-- Also unschedules analytics/TikTok pg_cron jobs when those extensions exist.

update public.config
set
  views = '[
    {"id":"today","enabled":true,"order":1,"dwellSeconds":120,"weight":1},
    {"id":"week","enabled":true,"order":2,"dwellSeconds":120,"weight":1},
    {"id":"momente","enabled":true,"order":3,"dwellSeconds":120,"weight":1},
    {"id":"vision","enabled":true,"order":4,"dwellSeconds":120,"weight":1},
    {"id":"home","enabled":true,"order":5,"dwellSeconds":120,"weight":1}
  ]'::jsonb,
  profiles = '[
    {"id":"morning","start":"06:00","end":"10:00","views":[{"id":"today","weight":1,"dwellSeconds":120},{"id":"week","weight":1,"dwellSeconds":120},{"id":"momente","weight":1,"dwellSeconds":120},{"id":"vision","weight":1,"dwellSeconds":120},{"id":"home","weight":1,"dwellSeconds":120}]},
    {"id":"daytime","start":"10:00","end":"18:00","views":[{"id":"today","weight":1,"dwellSeconds":120},{"id":"week","weight":1,"dwellSeconds":120},{"id":"momente","weight":1,"dwellSeconds":120},{"id":"vision","weight":1,"dwellSeconds":120},{"id":"home","weight":1,"dwellSeconds":120}]},
    {"id":"evening","start":"18:00","end":"23:00","views":[{"id":"today","weight":1,"dwellSeconds":120},{"id":"week","weight":1,"dwellSeconds":120},{"id":"momente","weight":1,"dwellSeconds":120},{"id":"vision","weight":1,"dwellSeconds":120},{"id":"home","weight":1,"dwellSeconds":120}]}
  ]'::jsonb,
  rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{timeOfDay}', 'false'::jsonb, true),
  updated_at = now()
where id = 1;

do $$
declare
  job_name text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  foreach job_name in array array['tv-dashboard-analytics', 'tv-dashboard-tiktok']
  loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
  end loop;
end
$$;
