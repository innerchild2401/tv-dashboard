-- Drop Mara calendar person, soft-delete Mara-sourced events, clear Mara cache.
-- Shared person-less rows (Prânz / Cină / Aniversare) are left alone.

update public.events
set deleted_at = coalesce(deleted_at, now())
where deleted_at is null
  and (
    person_id = 'mara'
    or external_id like 'ical:mara:%'
  );

update public.config
set
  people = coalesce(
    (
      select jsonb_agg(person)
      from jsonb_array_elements(people) as person
      where person->>'id' <> 'mara'
    ),
    '[]'::jsonb
  ),
  updated_at = now()
where id = 1
  and exists (
    select 1
    from jsonb_array_elements(people) as person
    where person->>'id' = 'mara'
  );

delete from public.integration_cache
where key = 'calendar:mara';
