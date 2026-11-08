-- Phone remote runtime: what the TV is holding, and the PIN lockout.
-- Row level security stays on. No policies. The service role is the only caller.

create table public.display_control (
  id smallint primary key default 1,
  mode text not null default 'rotate',
  view_id text,
  pinned_until timestamptz,
  dimmed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint display_control_singleton check (id = 1),
  constraint display_control_mode check (mode in ('rotate', 'paused', 'pinned', 'locked'))
);

create table public.pin_guard (
  id smallint primary key default 1,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint pin_guard_singleton check (id = 1),
  constraint pin_guard_failures check (failures >= 0)
);

insert into public.display_control (id) values (1);
insert into public.pin_guard (id) values (1);

create trigger display_control_set_updated_at
before update on public.display_control
for each row execute function public.set_updated_at();

create trigger pin_guard_set_updated_at
before update on public.pin_guard
for each row execute function public.set_updated_at();

alter table public.display_control enable row level security;
alter table public.pin_guard enable row level security;

revoke all on table public.display_control from public, anon, authenticated;
revoke all on table public.pin_guard from public, anon, authenticated;

grant select, insert, update, delete on table public.display_control to service_role;
grant select, insert, update, delete on table public.pin_guard to service_role;
