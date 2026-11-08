import { addDays, zonedParts, zonedTimeToUtc } from "@/lib/time/bucharest";
import type { SnapshotSpotlight } from "@/lib/state/types";

/** Sample Momente so Cast is not empty. Clear via delete_spotlight or soft-delete these rows. */
export function sampleSpotlights(now: Date): SnapshotSpotlight[] {
  const parts = zonedParts(now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  return [
    {
      id: "a1111111-1111-4111-8111-111111111111",
      title: "Vacanță la munte",
      kind: "trip",
      startsAt: zonedTimeToUtc({ ...addDays(today, 12), hour: 8, minute: 0 }).toISOString(),
      note: "Plecare dimineața",
      pinned: true,
    },
    {
      id: "a2222222-2222-4222-8222-222222222222",
      title: "Deadline proiect",
      kind: "deadline",
      startsAt: zonedTimeToUtc({ ...addDays(today, 3), hour: 18, minute: 0 }).toISOString(),
      note: null,
      pinned: false,
    },
  ];
}

/** How to clear sample Momente from a seeded database. */
export const SAMPLE_SPOTLIGHT_CLEAR_HINT =
  "Șterge rândurile cu external_id spotlight-vacanta-sample și spotlight-deadline-sample (sau apelează delete_spotlight).";
