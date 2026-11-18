-- MCP-managed custom TV pages (title + body), stored on the singleton config row.
-- Antena 3 live stays out of rotation; it uses display_control pin only.

alter table public.config
  add column if not exists pages jsonb not null default '[]'::jsonb;

comment on column public.config.pages is
  'Custom full-screen pages {id,title,body}[] controllable via MCP upsert_page/delete_page.';
