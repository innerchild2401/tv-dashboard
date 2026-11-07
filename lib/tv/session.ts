import type { TvState } from "@/lib/state/types";
import { VIEW_IDS, type ViewId } from "@/i18n/ro";
import { formatClock, formatDuration } from "@/lib/time/bucharest";

export const POLL_MS = 30_000;

export function isTvState(value: unknown): value is TvState {
  if (!value || typeof value !== "object") return false;
  const record = value as { ok?: unknown; currentView?: unknown; until?: unknown; chrome?: unknown };
  return record.ok === true && typeof record.currentView === "string" && typeof record.until === "string" && !!record.chrome;
}

export function nextTvState(current: TvState, incoming: unknown): TvState {
  return isTvState(incoming) ? incoming : current;
}

export function parseViewId(value: string | null | undefined): ViewId | null {
  if (!value) return null;
  return VIEW_IDS.includes(value as ViewId) ? (value as ViewId) : null;
}

export function withLiveClock(state: TvState, nowMs: number, live: boolean): TvState {
  if (!live) return state;
  const dwellRemaining = Math.max(0, Math.round((new Date(state.until).getTime() - nowMs) / 1000));
  const today = state.today?.nextEvent
    ? {
        ...state.today,
        nextEvent: {
          ...state.today.nextEvent,
          countdown: formatDuration(new Date(state.today.nextEvent.countdownTarget).getTime() - nowMs),
        },
      }
    : state.today;
  return {
    ...state,
    dwellRemaining,
    today,
    chrome: { ...state.chrome, clock: formatClock(new Date(nowMs)) },
  };
}
