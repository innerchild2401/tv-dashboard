import type { ViewId } from "@/i18n/ro";
import { STALE_AFTER_MS } from "@/lib/seed/sample-metrics";
import type { RotationCandidate } from "@/lib/rotation/engine";
import { addDays, dateKey, zonedParts, type DateParts } from "@/lib/time/bucharest";
import type { Snapshot, SnapshotMetric } from "@/lib/state/types";

export function viewCandidates(snapshot: Snapshot, now: Date): RotationCandidate[] {
  const flags = availability(snapshot, now);
  return [...snapshot.config.views]
    .filter((view) => view.enabled)
    .sort((left, right) => left.order - right.order)
    .map((view) => {
      const id = view.id as ViewId;
      const flag = flags[id] ?? { empty: true, stale: false };
      return {
        id,
        weight: view.weight,
        dwellSeconds: view.dwellSeconds,
        empty: flag.empty,
        stale: flag.stale,
      };
    });
}

export function availability(snapshot: Snapshot, now: Date): Record<ViewId, { empty: boolean; stale: boolean }> {
  const parts = zonedParts(now);
  const today: DateParts = { year: parts.year, month: parts.month, day: parts.day };
  const lead = addDays(today, parts.hour >= snapshot.config.rules.todayLeadTomorrowHour ? 1 : 0);
  const leadKey = dateKey(lead);
  const todayEvents = snapshot.events.some((event) => dateKey(zonedParts(new Date(event.start))) === leadKey);

  const weekStart = dateKey(addDays(today, -2));
  const weekEnd = dateKey(addDays(today, 4));
  const weekEvents = snapshot.events.some((event) => {
    const key = dateKey(zonedParts(new Date(event.start)));
    return key >= weekStart && key <= weekEnd;
  });

  const monthKeys = monthKeysFor(today);
  const monthEvents = snapshot.events.some((event) => monthKeys.has(dateKey(zonedParts(new Date(event.start)))));

  const cards = snapshot.cards.some((card) => !card.expiresAt || new Date(card.expiresAt).getTime() > now.getTime());
  const openTasks = snapshot.tasks.some((task) => !task.done);
  const homeEmpty = !openTasks && snapshot.shopping.length === 0;

  return {
    today: { empty: !todayEvents, stale: false },
    week: { empty: !weekEvents, stale: false },
    month: { empty: !monthEvents, stale: false },
    site: { empty: !hasPrefix(snapshot.metrics, "site."), stale: sourceIsStale(snapshot.metrics, "site.", now) },
    tiktok: { empty: !hasPrefix(snapshot.metrics, "tiktok."), stale: sourceIsStale(snapshot.metrics, "tiktok.", now) },
    vision: { empty: !cards, stale: false },
    home: { empty: homeEmpty, stale: false },
  };
}

export function sourceIsStale(metrics: SnapshotMetric[], prefix: string, now: Date): boolean {
  const rows = metrics.filter((metric) => metric.key.startsWith(prefix));
  if (rows.length === 0 || rows.some((metric) => metric.source !== "integration")) return false;
  let newest = 0;
  for (const row of rows) {
    const time = new Date(row.fetchedAt).getTime();
    if (time > newest) newest = time;
  }
  return now.getTime() - newest > STALE_AFTER_MS;
}

function hasPrefix(metrics: SnapshotMetric[], prefix: string): boolean {
  return metrics.some((metric) => metric.key.startsWith(prefix));
}

function monthKeysFor(today: DateParts): Set<string> {
  const first = { year: today.year, month: today.month, day: 1 };
  const weekday = mondayIndex(first);
  const start = addDays(first, -weekday);
  const keys = new Set<string>();
  for (let index = 0; index < 42; index += 1) keys.add(dateKey(addDays(start, index)));
  return keys;
}

export function mondayIndex(day: DateParts): number {
  const noon = new Date(Date.UTC(day.year, day.month - 1, day.day, 12));
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest",
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[name] ?? 0;
}
