-- Schema for the TV dashboard.
-- Row level security is enabled on every table. There are no policies:
-- anon and authenticated cannot read or write. Server routes use the
-- service role, which bypasses RLS. The photos bucket is private.

create extension if not exists pgcrypto;

create type public.source_kind as enum ('manual', 'assistant', 'integration');
create type public.card_kind as enum (
  'photo',
  'affirmation',
  'countdown',
  'word',
  'progress',
  'wins',
  'recap',
  'note'
);
create type public.inbox_status as enum ('new', 'routed', 'needs_review');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create table public.config (
  id smallint primary key default 1,
  theme jsonb not null,
  people jsonb not null,
  views jsonb not null,
  profiles jsonb not null,
  quiet_hours jsonb not null,
  location jsonb not null,
  rules jsonb not null,
  updated_at timestamptz not null default now(),
  constraint config_singleton check (id = 1)
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  view_id text not null,
  kind public.card_kind not null,
  title text,
  body text,
  color text not null,
  tilt numeric(3, 1) not null default 0,
  grid_col integer not null,
  grid_row integer not null,
  grid_col_span integer not null,
  grid_row_span integer not null,
  expires_at timestamptz,
  pinned boolean not null default false,
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_title_len check (title is null or char_length(title) <= 200),
  constraint cards_body_len check (body is null or char_length(body) <= 500),
  constraint cards_color_token check (color in ('sand', 'coral', 'lilac', 'mint', 'sky', 'pink')),
  constraint cards_tilt_range check (tilt >= -3 and tilt <= 3),
  constraint cards_grid_positive check (
    grid_col >= 0 and grid_row >= 0 and grid_col_span >= 1 and grid_row_span >= 1
  ),
  constraint cards_external_id_key unique (external_id),
  constraint cards_wins_evidence check (
    kind <> 'wins'
    or (
      jsonb_typeof(data -> 'items') = 'array'
      and not exists (
        select 1
        from jsonb_array_elements(data -> 'items') as item
        where coalesce(item ->> 'evidence', '') = ''
      )
    )
  ),
  constraint cards_progress_evidence check (
    kind <> 'progress' or coalesce(data ->> 'evidence', '') <> ''
  )
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  person_id text,
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_len check (char_length(title) between 1 and 200),
  constraint events_time_order check (ends_at >= starts_at),
  constraint events_external_id_key unique (external_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  done boolean not null default false,
  assignee_id text,
  due_date date,
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_text_len check (char_length(text) between 1 and 500),
  constraint tasks_external_id_key unique (external_id)
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  qty numeric not null default 1,
  unit text,
  category text,
  checked boolean not null default false,
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_text_len check (char_length(text) between 1 and 200),
  constraint shopping_qty_nonnegative check (qty >= 0),
  constraint shopping_external_id_key unique (external_id)
);

create table public.recaps (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  highlights jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recaps_text_len check (char_length(text) <= 800),
  constraint recaps_highlights_limit check (
    jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 5
  ),
  constraint recaps_external_id_key unique (external_id)
);

create table public.priorities (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  reason text not null,
  due_at timestamptz,
  task_id uuid references public.tasks (id) on delete set null,
  expires_at timestamptz not null,
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint priorities_text_len check (char_length(text) between 1 and 200),
  constraint priorities_reason_len check (char_length(reason) between 1 and 300),
  constraint priorities_external_id_key unique (external_id)
);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  received_at timestamptz not null default now(),
  status public.inbox_status not null default 'new',
  routed_to jsonb,
  source public.source_kind not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint inbox_text_len check (char_length(text) between 1 and 500)
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  tags text[] not null default '{}',
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_text_len check (char_length(text) between 1 and 500),
  constraint ideas_external_id_key unique (external_id)
);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value numeric not null,
  previous numeric,
  fetched_at timestamptz not null default now(),
  source public.source_kind not null,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint metrics_key_len check (char_length(key) between 1 and 120),
  constraint metrics_external_id_key unique (external_id)
);

create unique index metrics_key_active_idx on public.metrics (key) where deleted_at is null;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tool text not null,
  args_hash text not null,
  result jsonb not null,
  undo jsonb,
  created_at timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at) where deleted_at is null;
create index cards_view_idx on public.cards (view_id) where deleted_at is null;
create index tasks_open_idx on public.tasks (done, due_date) where deleted_at is null;
create index inbox_status_idx on public.inbox_items (status) where deleted_at is null;

create trigger config_set_updated_at
before update on public.config
for each row execute function public.set_updated_at();

create trigger cards_set_updated_at
before update on public.cards
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger shopping_set_updated_at
before update on public.shopping_items
for each row execute function public.set_updated_at();

create trigger recaps_set_updated_at
before update on public.recaps
for each row execute function public.set_updated_at();

create trigger priorities_set_updated_at
before update on public.priorities
for each row execute function public.set_updated_at();

create trigger ideas_set_updated_at
before update on public.ideas
for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'config',
    'cards',
    'events',
    'tasks',
    'shopping_items',
    'recaps',
    'priorities',
    'inbox_items',
    'ideas',
    'metrics',
    'audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
