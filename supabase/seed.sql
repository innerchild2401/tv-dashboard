-- Sample household for the Today mockup. Names and plans are fictional.
-- Timestamps are relative to the Bucharest day when the seed runs.
-- Keep the narrative aligned with lib/today/schedule.ts and lib/seed/sample-config.ts.

insert into public.config (id, theme, people, views, profiles, quiet_hours, location, rules)
values (
  1,
  '{"mode":"dark","accent":"teal","fonts":{"body":"Inter","display":"Space Grotesk"}}'::jsonb,
  '[{"id":"alex","name":"Alex","color":"#7AA7FF"},{"id":"mara","name":"Mara","color":"#FFB86B"}]'::jsonb,
  '[
    {"id":"today","enabled":true,"order":1,"dwellSeconds":45,"weight":3},
    {"id":"week","enabled":true,"order":2,"dwellSeconds":45,"weight":2},
    {"id":"month","enabled":true,"order":3,"dwellSeconds":45,"weight":1},
    {"id":"site","enabled":true,"order":4,"dwellSeconds":45,"weight":1},
    {"id":"tiktok","enabled":true,"order":5,"dwellSeconds":45,"weight":1},
    {"id":"vision","enabled":true,"order":6,"dwellSeconds":45,"weight":1},
    {"id":"home","enabled":true,"order":7,"dwellSeconds":45,"weight":1}
  ]'::jsonb,
  '[
    {"id":"morning","start":"06:00","end":"10:00","views":[{"id":"today","weight":3,"dwellSeconds":60},{"id":"week","weight":2,"dwellSeconds":45},{"id":"vision","weight":1,"dwellSeconds":45}]},
    {"id":"daytime","start":"10:00","end":"18:00","views":[{"id":"today","weight":3,"dwellSeconds":45},{"id":"week","weight":2,"dwellSeconds":45},{"id":"month","weight":1,"dwellSeconds":45},{"id":"home","weight":1,"dwellSeconds":45},{"id":"vision","weight":1,"dwellSeconds":45}]},
    {"id":"evening","start":"18:00","end":"23:00","views":[{"id":"today","weight":2,"dwellSeconds":45},{"id":"vision","weight":2,"dwellSeconds":45},{"id":"site","weight":1,"dwellSeconds":45},{"id":"tiktok","weight":1,"dwellSeconds":45},{"id":"home","weight":1,"dwellSeconds":45}]}
  ]'::jsonb,
  '{"start":"23:00","end":"06:00"}'::jsonb,
  '{"name":"Constanța","latitude":44.1598,"longitude":28.6348,"timezone":"Europe/Bucharest"}'::jsonb,
  '{"todayLeadTomorrowHour":20,"skipEmpty":true,"quietHours":true,"interrupts":true}'::jsonb
);

insert into public.tasks (id, text, done, assignee_id, due_date, source, locked, external_id)
select
  '11111111-1111-4111-8111-111111111111',
  'Ridică pachetul de la easybox',
  false,
  'alex',
  (bounds.day_start at time zone 'Europe/Bucharest')::date,
  'manual',
  true,
  'task-easybox'
from (
  select (date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest') as day_start
) as bounds;

insert into public.events (id, title, starts_at, ends_at, all_day, person_id, source, locked, external_id)
select
  rows.id,
  rows.title,
  bounds.day_start + rows.start_offset,
  bounds.day_start + rows.end_offset,
  false,
  rows.person_id,
  'integration',
  false,
  rows.external_id
from (
  select (date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest') as day_start
) as bounds
cross join (
  values
    ('22222222-2222-4222-8222-222222222201'::uuid, 'Mic dejun', interval '7 hours 30 minutes', interval '8 hours 15 minutes', 'alex', 'event-breakfast'),
    ('22222222-2222-4222-8222-222222222202'::uuid, 'Întâlnire la birou', interval '9 hours', interval '10 hours 30 minutes', 'alex', 'event-meeting'),
    ('22222222-2222-4222-8222-222222222203'::uuid, 'Prânz', interval '13 hours', interval '13 hours 45 minutes', null, 'event-lunch'),
    ('22222222-2222-4222-8222-222222222204'::uuid, 'Piață', interval '16 hours 30 minutes', interval '17 hours 30 minutes', 'mara', 'event-market'),
    ('22222222-2222-4222-8222-222222222205'::uuid, 'Cină', interval '19 hours', interval '20 hours', null, 'event-dinner'),
    ('22222222-2222-4222-8222-222222222206'::uuid, 'Control medical', interval '1 day 10 hours', interval '1 day 10 hours 45 minutes', 'mara', 'event-checkup'),
    ('22222222-2222-4222-8222-222222222207'::uuid, 'Film', interval '1 day 18 hours 30 minutes', interval '1 day 20 hours', 'alex', 'event-film'),
    ('22222222-2222-4222-8222-222222222208'::uuid, 'Cumpărături', interval '2 days 11 hours', interval '2 days 12 hours 30 minutes', 'mara', 'event-shopping'),
    ('22222222-2222-4222-8222-222222222209'::uuid, 'Plimbare pe faleză', interval '3 days 9 hours 30 minutes', interval '3 days 11 hours', 'alex', 'event-walk')
) as rows (id, title, start_offset, end_offset, person_id, external_id);

insert into public.priorities (id, text, reason, due_at, task_id, expires_at, source, locked, external_id)
select
  '33333333-3333-4333-8333-333333333301',
  'Ridică pachetul de la easybox',
  'Ajunge azi până la 18:00, iar taskul nu e bifat',
  bounds.day_start + interval '18 hours',
  '11111111-1111-4111-8111-111111111111',
  bounds.day_start + interval '1 day',
  'assistant',
  false,
  'priority-sample'
from (
  select (date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest') as day_start
) as bounds;

insert into public.shopping_items (id, text, qty, unit, category, checked, source, locked, external_id)
values
  ('44444444-4444-4444-8444-444444444401', 'Lapte', 2, 'l', 'Lactate', false, 'manual', true, 'shop-milk'),
  ('44444444-4444-4444-8444-444444444402', 'Pâine', 1, 'buc', 'Brutărie', false, 'manual', true, 'shop-bread'),
  ('44444444-4444-4444-8444-444444444403', 'Mere', 1, 'kg', 'Fructe', true, 'manual', true, 'shop-apples');

insert into public.recaps (id, text, highlights, expires_at, source, locked, external_id)
select
  '55555555-5555-4555-8555-555555555501',
  'O zi liniștită: întâlnirea de dimineață s-a terminat, iar seara rămâne cină.',
  '["Întâlnirea s-a încheiat","Pachetul ajunge azi"]'::jsonb,
  bounds.day_start + interval '2 days',
  'assistant',
  false,
  'recap-sample'
from (
  select (date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest') as day_start
) as bounds;

insert into public.cards (
  id, view_id, kind, title, body, color, tilt,
  grid_col, grid_row, grid_col_span, grid_row_span,
  pinned, source, locked, external_id, data
)
values
  (
    '66666666-6666-4666-8666-666666666601',
    'vision',
    'affirmation',
    null,
    'Astăzi fac un singur lucru bine.',
    'sand',
    2,
    0, 0, 2, 2,
    false,
    'assistant',
    false,
    'card-affirmation-sample',
    '{}'::jsonb
  ),
  (
    '66666666-6666-4666-8666-666666666602',
    'vision',
    'word',
    'Cuvântul lunii',
    'Răbdare',
    'lilac',
    -1,
    2, 0, 1, 1,
    false,
    'assistant',
    false,
    'card-word-sample',
    '{"word":"Răbdare"}'::jsonb
  );

insert into public.ideas (id, text, tags, source, locked, external_id)
values (
  '77777777-7777-4777-8777-777777777701',
  'O seară fără ecrane după cină.',
  array['acasă'],
  'manual',
  true,
  'idea-quiet-evening'
);
