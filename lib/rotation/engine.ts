import { rotationReason, type ViewId } from "@/i18n/ro";
import { dateKey, zonedParts, zonedTimeToUtc, type DateParts } from "@/lib/time/bucharest";

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

  const today = pool.find((view) => view.id === "today");
  const week = pool.find((view) => view.id === "week");
  if (today?.empty) {
    if (week && !week.empty) week.weight += today.weight;
    pool = pool.filter((view) => view.id !== "today");
  }
  pool = pool.filter((view) => !view.empty);

  const fresh = pool.filter((view) => !view.stale);
  if (fresh.length > 0) return fresh;
  if (pool.length === 1) return pool;
  return [];
}

export function slotSeed(dayKey: string, slot: number): number {
  let hash = 2166136261;
  const text = `${dayKey}:${slot}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function weightedPick(
  pool: RotationCandidate[],
  seed: number,
  previous: ViewId | null,
): RotationCandidate {
  const withoutPrevious = previous ? pool.filter((view) => view.id !== previous) : pool;
  const choices = withoutPrevious.length > 0 ? withoutPrevious : pool;
  const total = choices.reduce((sum, view) => sum + view.weight, 0);
  let cursor = (seed / 4294967296) * total;
  for (const view of choices) {
    cursor -= view.weight;
    if (cursor < 0) return view;
  }
  return choices[choices.length - 1] as RotationCandidate;
}

export function resolveRotation(now: Date, prepared: RotationCandidate[]): RotationDecision {
  const fallback = prepared[0];
  if (!fallback) {
    throw new Error("Rotation needs at least one view");
  }

  const parts = zonedParts(now);
  const day: DateParts = { year: parts.year, month: parts.month, day: parts.day };
  const dayStart = zonedTimeToUtc({ ...day, hour: 0, minute: 0 }).getTime();
  const key = dateKey(day);
  let cursor = dayStart;
  const nowMs = now.getTime();
  let previous: ViewId | null = null;

  for (let slot = 0; slot < 5000; slot += 1) {
    const view = weightedPick(prepared, slotSeed(key, slot), previous);
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
