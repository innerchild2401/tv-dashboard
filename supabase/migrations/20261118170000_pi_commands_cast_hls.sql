-- Allow Pi to cast Antena 3 free HLS via Default Media Receiver (sound-reliable path).
alter table public.pi_commands drop constraint pi_commands_kind;
alter table public.pi_commands add constraint pi_commands_kind
  check (kind in ('cast_now', 'release', 'restart_service', 'cast_hls'));
