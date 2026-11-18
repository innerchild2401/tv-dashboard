-- Draft Victorii layouts for preview_layout → publish_layout.
alter table public.config
  add column if not exists vision_draft jsonb;

comment on column public.config.vision_draft is
  'MCP draft board from preview_layout; publish_layout applies it atomically then clears.';

-- Hide overlapping/outdated sample cards; keep the live quote + Zian win positions.
update public.cards
set
  data = coalesce(data, '{}'::jsonb) || '{"hidden":true}'::jsonb,
  updated_at = now()
where external_id in ('card-affirmation-sample', 'card-wins-sample')
  and deleted_at is null;

-- Preferred live layout: quote (0,0) 2×2, Zian (2,1) 1×1.
update public.cards
set
  grid_col = 0,
  grid_row = 0,
  grid_col_span = 2,
  grid_row_span = 2,
  updated_at = now()
where external_id = 'photo-casa-la-care-visam'
  and deleted_at is null;

update public.cards
set
  grid_col = 2,
  grid_row = 1,
  grid_col_span = 1,
  grid_row_span = 1,
  updated_at = now()
where external_id = 'win-zian-gala-lumina-2026'
  and deleted_at is null;

-- Pack remaining visible samples into free cells (no overlaps with the 2×2 quote).
update public.cards
set grid_col = 2, grid_row = 0, grid_col_span = 1, grid_row_span = 1, updated_at = now()
where external_id = 'card-countdown-sample' and deleted_at is null;

update public.cards
set grid_col = 3, grid_row = 0, grid_col_span = 1, grid_row_span = 1, updated_at = now()
where external_id = 'card-word-sample' and deleted_at is null;

update public.cards
set grid_col = 0, grid_row = 2, grid_col_span = 2, grid_row_span = 1, updated_at = now()
where external_id = 'card-progress-sample' and deleted_at is null;

update public.cards
set grid_col = 2, grid_row = 2, grid_col_span = 2, grid_row_span = 1, updated_at = now()
where external_id = 'card-recap-sample' and deleted_at is null;
