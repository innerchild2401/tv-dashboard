import { LIVE_VIEW_ID } from "@/i18n/ro";
import type { TvState } from "@/lib/state/types";
import { LIVE_PLAY_START_MS } from "@/lib/live/playback";

/** Fast poll while Antena 3 is on screen so stop/pin clears apply in seconds. */
export const LIVE_EXIT_POLL_MS = 1_500;

/** TV bearer endpoint — clears only an active antena3 pin. */
export function liveAbandonPath(): string {
  return "/api/tv/live/abandon";
}

/** True when local UI is still on Antena 3 overlay. */
export function isLiveOverlay(state: Pick<TvState, "currentView" | "live">): boolean {
  return state.currentView === LIVE_VIEW_ID || state.live != null;
}

/** Server (or optimistic) state no longer wants the live overlay. */
export function serverLeftLive(incoming: Pick<TvState, "currentView" | "live" | "hold">): boolean {
  if (incoming.currentView === LIVE_VIEW_ID) return false;
  if (incoming.live != null) return false;
  return true;
}

/** Wall-clock: stream never started — abandon pin and return to rotation. */
export function shouldAbandonStuckLive(opts: {
  onLive: boolean;
  playing: boolean;
  startedAtMs: number;
  nowMs: number;
  graceMs?: number;
}): boolean {
  if (!opts.onLive || opts.playing) return false;
  const grace = opts.graceMs ?? LIVE_PLAY_START_MS;
  return opts.nowMs - opts.startedAtMs >= grace;
}
