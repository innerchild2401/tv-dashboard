-- Last-good calendar and weather readings. The service role is the only
-- caller. Calendar addresses stay in environment variables, not in this table.

create table public.integration_cache (
  key text primary key,
  etag text,
  attempted_at timestamptz,
  fetched_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  ok boolean not null default false,
  constraint integration_cache_key_len check (char_length(key) between 1 and 80)
);

alter table public.integration_cache enable row level security;

revoke all on table public.integration_cache from anon, authenticated;

grant select, insert, update, delete on table public.integration_cache to service_role;
