-- Momente spotlights: countdown moments for the TV view that replaces Lună.
-- RLS enabled with no policies; only the service role (server routes) can access.

create type public.spotlight_kind as enum ('trip', 'competition', 'deadline', 'other');

create table public.spotlights (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind public.spotlight_kind not null default 'other',
  starts_at timestamptz not null,
  note text,
  pinned boolean not null default false,
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spotlights_title_len check (char_length(title) between 1 and 200),
  constraint spotlights_note_len check (note is null or char_length(note) <= 500),
  constraint spotlights_external_id_key unique (external_id)
);

create index spotlights_starts_at_idx on public.spotlights (starts_at) where deleted_at is null;
create index spotlights_pinned_idx on public.spotlights (pinned, starts_at) where deleted_at is null;

create trigger spotlights_set_updated_at
before update on public.spotlights
for each row execute function public.set_updated_at();

alter table public.spotlights enable row level security;
revoke all on table public.spotlights from anon, authenticated;

-- Replace Lună (month) with Momente in existing config rows.
update public.config
set
  views = (
    select coalesce(jsonb_agg(
      case
        when item ->> 'id' = 'month' then jsonb_set(item, '{id}', '"momente"')
        else item
      end
      order by ordinality
    ), views)
    from jsonb_array_elements(views) with ordinality as t(item, ordinality)
  ),
  profiles = (
    select coalesce(jsonb_agg(
      jsonb_set(
        profile,
        '{views}',
        (
          select coalesce(jsonb_agg(
            case
              when slot ->> 'id' = 'month' then jsonb_set(slot, '{id}', '"momente"')
              else slot
            end
            order by slot_ord
          ), '[]'::jsonb)
          from jsonb_array_elements(profile -> 'views') with ordinality as s(slot, slot_ord)
        )
      )
      order by profile_ord
    ), profiles)
    from jsonb_array_elements(profiles) with ordinality as p(profile, profile_ord)
  ),
  updated_at = now()
where id = 1;
