import { ro } from "@/i18n/ro";
import { MOMENTE_DESIGN } from "@/lib/agent/design";
import type { MomenteItem, MomenteLayout, MomenteModel, Snapshot, SnapshotSpotlight } from "@/lib/state/types";
import { dateKey, formatMomenteDue, zonedParts } from "@/lib/time/bucharest";

/** Soft ceiling so a runaway feed cannot flood the Cast canvas. All active items show up to this. */
export const MOMENTE_MAX_VISIBLE = MOMENTE_DESIGN.maxVisible;

/** Whole Bucharest calendar days from `now` until `startsAt`. Day 0 = today. */
export function bucharestDaysUntil(startsAt: string | Date, now: Date): number {
  const target = dateKey(zonedParts(typeof startsAt === "string" ? new Date(startsAt) : startsAt));
  const current = dateKey(zonedParts(now));
  const targetUtc = Date.parse(`${target}T00:00:00Z`);
  const currentUtc = Date.parse(`${current}T00:00:00Z`);
  return Math.round((targetUtc - currentUtc) / 86_400_000);
}

export function momenteLayoutForCount(count: number): MomenteLayout {
  if (count <= 0) return "empty";
  if (count === 1) return "solo";
  if (count === 2) return "split";
  if (count <= 4) return "tiles";
  if (count <= 6) return "dense";
  if (count <= 9) return "gallery";
  return "packed";
}

export function selectMomenteItems(spotlights: SnapshotSpotlight[], now: Date): {
  items: MomenteItem[];
  hidden: number;
  layout: MomenteLayout;
} {
  const live = spotlights
    .map((row) => toItem(row, now))
    .filter((item): item is MomenteItem => item !== null)
    .sort(compareMomente);

  const layout = momenteLayoutForCount(live.length);
  if (live.length <= MOMENTE_MAX_VISIBLE) {
    return { items: live, hidden: 0, layout };
  }

  const pinned = live.filter((item) => item.pinned);
  const rest = live.filter((item) => !item.pinned);
  const kept: MomenteItem[] = [];
  for (const item of pinned) {
    if (kept.length >= MOMENTE_MAX_VISIBLE) break;
    kept.push(item);
  }
  for (const item of rest) {
    if (kept.length >= MOMENTE_MAX_VISIBLE) break;
    kept.push(item);
  }
  kept.sort(compareMomente);
  return {
    items: kept,
    hidden: live.length - kept.length,
    layout: momenteLayoutForCount(kept.length),
  };
}

export function projectMomente(snapshot: Snapshot, now: Date): MomenteModel {
  const selected = selectMomenteItems(snapshot.spotlights, now);
  return {
    title: ro.views.momente,
    layout: selected.layout,
    items: selected.items,
    hidden: selected.hidden,
    emptyLabel: ro.momenteEmpty,
  };
}

export function kindLabel(kind: SnapshotSpotlight["kind"]): string {
  return ro.spotlightKinds[kind];
}

function toItem(row: SnapshotSpotlight, now: Date): MomenteItem | null {
  const days = bucharestDaysUntil(row.startsAt, now);
  if (days < 0) return null;
  const today = days === 0;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    kindLabel: kindLabel(row.kind),
    note: row.note,
    pinned: row.pinned,
    days,
    daysLabel: today ? ro.dueToday : String(days),
    unitLabel: today ? null : days === 1 ? ro.dayOne : ro.days,
    dueLabel: formatMomenteDue(row.startsAt),
    today,
  };
}

function compareMomente(left: MomenteItem, right: MomenteItem): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  if (left.days !== right.days) return left.days - right.days;
  return left.title.localeCompare(right.title, "ro");
}
