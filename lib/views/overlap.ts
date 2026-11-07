import { addDays, dateKey, zonedParts, zonedTimeToUtc, type DateParts } from "@/lib/time/bucharest";

export type DatedEvent = {
  start: string;
  end: string;
  allDay: boolean;
};

export function eventOnDay(event: DatedEvent, day: DateParts): boolean {
  if (event.allDay) {
    const startKey = dateKey(zonedParts(new Date(event.start)));
    const endKey = dateKey(zonedParts(new Date(event.end)));
    const key = dateKey(day);
    if (endKey <= startKey) return key === startKey;
    return key >= startKey && key < endKey;
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  const dayStart = zonedTimeToUtc({ ...day, hour: 0, minute: 0 });
  const dayEnd = zonedTimeToUtc({ ...addDays(day, 1), hour: 0, minute: 0 });
  return start < dayEnd && end > dayStart;
}

export function compareEvents(left: DatedEvent, right: DatedEvent): number {
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
  return left.start.localeCompare(right.start);
}
