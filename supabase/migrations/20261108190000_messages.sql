-- Lightweight family messages (post-it notes) for the Acasă TV board.
-- RLS enabled with no policies; only the service role (server routes) can access.

create type public.message_color as enum ('butter', 'peach', 'mint', 'sky', 'rose', 'lemon');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author text,
  color public.message_color not null default 'butter',
  source public.source_kind not null,
  locked boolean not null default false,
  external_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_text_len check (char_length(text) between 1 and 280),
  constraint messages_author_len check (author is null or char_length(author) between 1 and 80),
  constraint messages_external_id_key unique (external_id)
);

create index messages_live_idx on public.messages (created_at desc) where deleted_at is null;

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

alter table public.messages enable row level security;
revoke all on table public.messages from anon, authenticated;
