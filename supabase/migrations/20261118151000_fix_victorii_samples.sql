-- Soften broken Victorii sample copy for Cast distance (idempotent by external_id).

update public.recaps
set
  text = 'O zi liniștită: tema e gata, iar seara rămâne cină în familie.',
  highlights = '["Tema terminată","Pachetul ajunge azi"]'::jsonb
where external_id = 'recap-sample'
  and deleted_at is null;

update public.cards
set
  title = 'Efeseni 5:22',
  body = 'Supuneți-vă unii altora în frica lui Hristos.',
  grid_col = 0,
  grid_row = 0,
  grid_col_span = 2,
  grid_row_span = 1,
  data = '{"text":"Supuneți-vă unii altora în frica lui Hristos."}'::jsonb
where external_id = 'card-affirmation-sample'
  and deleted_at is null;

update public.cards
set
  body = 'Răbdare în fiecare zi'
where external_id = 'card-word-sample'
  and deleted_at is null;

update public.cards
set
  body = 'Plecare spre munte',
  grid_col = 3,
  grid_row = 0,
  grid_col_span = 1,
  grid_row_span = 1
where external_id = 'card-countdown-sample'
  and deleted_at is null;

update public.cards
set
  title = 'Pachetul',
  body = 'Easybox până diseară'
where external_id = 'card-progress-sample'
  and deleted_at is null;

update public.cards
set
  title = 'Bravo, Zian! 🏆',
  body = 'A terminat tema la mate',
  grid_col = 0,
  grid_row = 1,
  grid_col_span = 2,
  grid_row_span = 2,
  data = '{"items":[{"text":"A terminat tema la mate","evidence":"manual:sample"}]}'::jsonb
where external_id = 'card-wins-sample'
  and deleted_at is null;

update public.cards
set
  title = 'Rezumat',
  body = 'O zi liniștită: tema e gata, iar seara rămâne cină în familie.'
where external_id = 'card-recap-sample'
  and deleted_at is null;
