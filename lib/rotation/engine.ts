import { rotationReason, type ViewId } from "@/i18n/ro";
import { zonedParts, zonedTimeToUtc, type DateParts } from "@/lib/time/bucharest";

export type RotationCandidate = {
  id: ViewId;
  weight: number;
  dwellSeconds: number;
  empty: boolean;
  stale: boolean;
};

export type RotationDecision = {
  viewId: ViewId;
  until: string;
  dwellSeconds: number;
  weight: number;
  reason: string;
  slot: number;
};

export function prepareCandidates(input: RotationCandidate[], skipEmpty: boolean): RotationCandidate[] {
  const views = input.map((view) => ({ ...view }));
  let pool = views.filter((view) => view.weight > 0);
  if (!skipEmpty) return pool;

  pool = pool.filter((view) => !view.empty);

  const fresh = pool.filter((view) => !view.stale);
  if (fresh.length > 0) return fresh;
  if (pool.length === 1) return pool;
  return [];
}

/** Next view in config order after `previous` (wraps). No-immediate-repeat when length > 1. */
export function nextInOrder(pool: RotationCandidate[], previous: ViewId | null): RotationCandidate {
  if (pool.length === 0) {
    throw new Error("Rotation needs at least one view");
  }
  if (pool.length === 1 || !previous) {
    return pool[0] as RotationCandidate;
  }
  const index = pool.findIndex((view) => view.id === previous);
  if (index < 0) return pool[0] as RotationCandidate;
  return pool[(index + 1) % pool.length] as RotationCandidate;
}

export function resolveRotation(now: Date, prepared: RotationCandidate[]): RotationDecision {
  const fallback = prepared[0];
  if (!fallback) {
    throw new Error("Rotation needs at least one view");
  }

  const parts = zonedParts(now);
  const day: DateParts = { year: parts.year, month: parts.month, day: parts.day };
  const dayStart = zonedTimeToUtc({ ...day, hour: 0, minute: 0 }).getTime();
  let cursor = dayStart;
  const nowMs = now.getTime();
  let previous: ViewId | null = null;

  for (let slot = 0; slot < 5000; slot += 1) {
    const view = nextInOrder(prepared, previous);
    const until = cursor + view.dwellSeconds * 1000;
    if (nowMs < until) {
      return {
        viewId: view.id,
        until: new Date(until).toISOString(),
        dwellSeconds: view.dwellSeconds,
        weight: view.weight,
        reason: rotationReason(view.id, view.weight),
        slot,
      };
    }
    previous = view.id;
    cursor = until;
  }

  return {
    viewId: fallback.id,
    until: new Date(nowMs + fallback.dwellSeconds * 1000).toISOString(),
    dwellSeconds: fallback.dwellSeconds,
    weight: fallback.weight,
    reason: rotationReason(fallback.id, fallback.weight),
    slot: 0,
  };
}

/**
 * View that should paint when the current dwell ends (Cast SSR / classic fallback).
 * Always treats `previous` as the view being left — required when `?view=` forces a
 * screen that is not the wall-clock pick, otherwise nextView can lock a 2-cycle.
 */
export function peekNextView(prepared: RotationCandidate[], previous: ViewId, _untilIso: string): ViewId {
  if (prepared.length === 0) return previous;
  return nextInOrder(prepared, previous).id;
}
