import { sampleConfig } from "@/lib/seed/sample-config";
import { sampleCards, sampleRecap, sampleShopping, sampleTasks } from "@/lib/seed/sample-board";
import { sampleMetrics } from "@/lib/seed/sample-metrics";
import { sampleSchedule } from "@/lib/today/schedule";
import { addDays, endOfZonedDay, zonedParts, zonedTimeToUtc } from "@/lib/time/bucharest";
import { configSchema } from "@/lib/schemas";
import type { Snapshot } from "@/lib/state/types";

export function sampleSnapshot(now: Date): Snapshot {
  const parts = zonedParts(now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  return {
    config: configSchema.parse(sampleConfig),
    events: sampleSchedule.events.map((event) => {
      const day = addDays(today, event.dayOffset);
      return {
        id: event.id,
        title: event.title,
        start: zonedTimeToUtc({ ...day, hour: event.start.hour, minute: event.start.minute }).toISOString(),
        end: zonedTimeToUtc({ ...day, hour: event.end.hour, minute: event.end.minute }).toISOString(),
        allDay: event.allDay ?? false,
        personId: event.personId,
      };
    }),
    tasks: sampleTasks.map((task) => ({
      ...task,
      dueDate: `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`,
    })),
    shopping: sampleShopping,
    cards: sampleCards(now),
    recap: {
      ...sampleRecap,
      expiresAt: endOfZonedDay(addDays(today, 1)).toISOString(),
    },
    priorities: [
      {
        text: sampleSchedule.priority.text,
        reason: sampleSchedule.priority.reason,
        expiresAt: endOfZonedDay(today).toISOString(),
        source: "assistant",
        locked: false,
        updatedAt: now.toISOString(),
      },
    ],
    inboxWaiting: 0,
    metrics: sampleMetrics(now).map(({ key, value, previous, fetchedAt, source }) => ({
      key,
      value,
      previous,
      fetchedAt,
      source,
    })),
    weather: {
      location: sampleConfig.location.name,
      tempC: sampleSchedule.weather.tempC,
      label: sampleSchedule.weather.label,
      fetchedAt: null,
    },
    calendarFetchedAt: null,
  };
}
