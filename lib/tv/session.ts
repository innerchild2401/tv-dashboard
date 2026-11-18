import type { TvState } from "@/lib/state/types";
import { LIVE_VIEW_ID, type ViewId } from "@/i18n/ro";
import { formatClock, formatDuration } from "@/lib/time/bucharest";

/** Phone remote / nightly checks. */
export const POLL_MS = 30_000;
/** TV soft-pin backup when realtime is quiet — keep short so Antena 3 applies in a few seconds. */
export const TV_POLL_MS = 5_000;

const VIEW_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

/** Soft rotation endpoint. Pass `view` only when advancing after dwell — never change the Cast URL. */
export function tvStatePath(view?: ViewId | null): string {
  if (!view) return "/api/state";
  return `/api/state?view=${encodeURIComponent(view)}`;
}

export function isTvState(value: unknown): value is TvState {
  if (!value || typeof value !== "object") return false;
  const record = value as {
    ok?: unknown;
    currentView?: unknown;
    nextView?: unknown;
    until?: unknown;
    chrome?: unknown;
    buildId?: unknown;
  };
  return (
    record.ok === true &&
    typeof record.currentView === "string" &&
    typeof record.until === "string" &&
    !!record.chrome &&
    (record.nextView === undefined || typeof record.nextView === "string") &&
    (record.buildId === undefined || typeof record.buildId === "string")
  );
}

export function nextTvState(current: TvState, incoming: unknown): TvState {
  if (!isTvState(incoming)) return current;
  return {
    ...incoming,
    buildId: typeof incoming.buildId === "string" && incoming.buildId ? incoming.buildId : current.buildId,
    nextView: parseViewId(incoming.nextView) ?? incoming.currentView,
  };
}

export function readIncomingBuildId(incoming: unknown): string | null {
  if (!incoming || typeof incoming !== "object") return null;
  const buildId = (incoming as { buildId?: unknown }).buildId;
  return typeof buildId === "string" && buildId.trim() ? buildId.trim() : null;
}

export function parseViewId(value: string | null | undefined): ViewId | null {
  if (!value || !VIEW_ID_RE.test(value)) return null;
  if (value === LIVE_VIEW_ID) return LIVE_VIEW_ID;
  return value;
}

/** Keep token and other params; force the next SSR view for Cast / classic reload. */
export function tvPathWithView(href: string, view: ViewId): string {
  const url = new URL(href, "http://tv.local");
  url.searchParams.set("view", view);
  return `${url.pathname}${url.search}${url.hash}`;
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
