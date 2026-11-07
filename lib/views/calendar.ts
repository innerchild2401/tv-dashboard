import { ro } from "@/i18n/ro";
import { personChip } from "@/lib/people";
import type { MonthModel, Snapshot, WeekModel } from "@/lib/state/types";
import { mondayIndex } from "@/lib/state/availability";
import {
  addDays,
  dateKey,
  formatClock,
  TIME_ZONE,
  zonedParts,
  zonedTimeToUtc,
  type DateParts,
} from "@/lib/time/bucharest";

export function projectWeek(snapshot: Snapshot, now: Date): WeekModel {
  const parts = zonedParts(now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  const todayKey = dateKey(today);
  const columns = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 2);
    const key = dateKey(day);
    const noon = zonedTimeToUtc({ ...day, hour: 12, minute: 0 });
    const events = snapshot.events
      .filter((event) => dateKey(zonedParts(new Date(event.start))) === key)
      .sort((left, right) => left.start.localeCompare(right.start))
      .map((event) => ({
        id: event.id,
        timeLabel: event.allDay ? ro.allDayShort : formatClock(new Date(event.start)),
        title: event.title,
        person: personChip(snapshot.config.people, event.personId),
      }));
    return {
      key,
      weekday: label(noon, "short"),
      day: String(day.day),
      isToday: key === todayKey,
      events,
    };
  });
  return { columns };
}

export function projectMonth(snapshot: Snapshot, now: Date): MonthModel {
  const parts = zonedParts(now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  const todayKey = dateKey(today);
  const first: DateParts = { year: today.year, month: today.month, day: 1 };
  const start = addDays(first, -mondayIndex(first));
  const byDay = new Map<string, string[]>();
  for (const event of [...snapshot.events].sort((left, right) => left.start.localeCompare(right.start))) {
    const key = dateKey(zonedParts(new Date(event.start)));
    const titles = byDay.get(key) ?? [];
    titles.push(event.title);
    byDay.set(key, titles);
  }

  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = addDays(start, index);
    const key = dateKey(day);
    const titles = byDay.get(key) ?? [];
    return {
      key,
      day: String(day.day),
      inMonth: day.month === today.month && day.year === today.year,
      isToday: key === todayKey,
      title: titles[0] ?? null,
      extra: Math.max(0, titles.length - 1),
    };
  });

  const titleDate = zonedTimeToUtc({ ...today, hour: 12, minute: 0 });
  return {
    title: capitalize(
      new Intl.DateTimeFormat("ro-RO", { timeZone: TIME_ZONE, month: "long", year: "numeric" }).format(titleDate),
    ),
    weekdays: weekdayLabels(),
    cells,
  };
}

function weekdayLabels(): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays({ year: 2026, month: 1, day: 5 }, index);
    return label(zonedTimeToUtc({ ...day, hour: 12, minute: 0 }), "short");
  });
}

function label(date: Date, weekday: "short" | "narrow"): string {
  return capitalize(new Intl.DateTimeFormat("ro-RO", { timeZone: TIME_ZONE, weekday }).format(date));
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("ro-RO") + value.slice(1);
}
