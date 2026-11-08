-- Pi watchdog: last heartbeat, commands queued from the phone, and a short log.
-- Row level security stays on. No policies. The service role is the only caller.

create table public.pi_status (
  id smallint primary key default 1,
  receiver text not null default 'unknown',
  app_name text,
  app_id text,
  last_cast_at timestamptz,
  uptime_seconds integer,
  local_ip text,
  agent_version text,
  heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pi_status_singleton check (id = 1),
  constraint pi_status_receiver check (receiver in ('idle', 'backdrop', 'dashboard', 'other', 'unknown')),
  constraint pi_status_uptime check (uptime_seconds is null or uptime_seconds >= 0),
  constraint pi_status_app_name_len check (app_name is null or char_length(app_name) <= 80),
  constraint pi_status_app_id_len check (app_id is null or char_length(app_id) <= 80),
  constraint pi_status_ip_len check (local_ip is null or char_length(local_ip) <= 64),
  constraint pi_status_version_len check (agent_version is null or char_length(agent_version) <= 40)
);

create table public.pi_commands (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  minutes integer,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint pi_commands_kind check (kind in ('cast_now', 'release', 'restart_service')),
  constraint pi_commands_status check (status in ('queued', 'delivered')),
  constraint pi_commands_minutes check (minutes is null or (minutes >= 1 and minutes <= 240))
);

create index pi_commands_queued_idx on public.pi_commands (created_at) where status = 'queued';

create table public.pi_log (
  id uuid primary key default gen_random_uuid(),
  line text not null,
  created_at timestamptz not null default now(),
  constraint pi_log_line_len check (char_length(line) between 1 and 300)
);

create index pi_log_created_idx on public.pi_log (created_at desc);

insert into public.pi_status (id) values (1);

create trigger pi_status_set_updated_at
before update on public.pi_status
for each row execute function public.set_updated_at();

alter table public.pi_status enable row level security;
alter table public.pi_commands enable row level security;
alter table public.pi_log enable row level security;

revoke all on table public.pi_status from public, anon, authenticated;
revoke all on table public.pi_commands from public, anon, authenticated;
revoke all on table public.pi_log from public, anon, authenticated;

grant select, insert, update, delete on table public.pi_status to service_role;
grant select, insert, update, delete on table public.pi_commands to service_role;
grant select, insert, update, delete on table public.pi_log to service_role;
