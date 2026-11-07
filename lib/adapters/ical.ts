import { createHash } from "node:crypto";
import { parseICS, type VEvent } from "node-ical";
import { ro } from "@/i18n/ro";
import { CALENDAR_WINDOW_DAYS } from "@/lib/adapters/intervals";
import { addDays, dateKey, zonedParts, zonedTimeToUtc, type DateParts } from "@/lib/time/bucharest";

export type ExpandedEvent = {
  externalId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  personId: string;
};

type FeedFacts = {
  allDayStart: string | null;
  allDayEnd: string | null;
  allDayExdates: Set<string>;
};

const MAX_EVENTS = 2000;

export function calendarWindow(now: Date, days = CALENDAR_WINDOW_DAYS): { start: Date; end: Date } {
  const parts = zonedParts(now);
  return {
    start: zonedTimeToUtc({ ...addDays(parts, -days), hour: 0, minute: 0 }),
    end: zonedTimeToUtc({ ...addDays(parts, days + 1), hour: 0, minute: 0 }),
  };
}

export function expandIcal(
  ics: string,
  input: { personId: string; now: Date; windowDays?: number },
): { ok: true; events: ExpandedEvent[] } | { ok: false } {
  if (!ics.includes("BEGIN:VCALENDAR")) return { ok: false };
  try {
    const parsed = parseICS(ics);
    const facts = readFeedFacts(ics);
    const window = calendarWindow(input.now, input.windowDays ?? CALENDAR_WINDOW_DAYS);
    const byId = new Map<string, ExpandedEvent>();
    for (const component of Object.values(parsed)) {
      if (!component || component.type !== "VEVENT") continue;
      for (const event of expandEvent(component, facts.get(component.uid) ?? emptyFacts(), input.personId, window)) {
        byId.set(event.externalId, event);
        if (byId.size >= MAX_EVENTS) break;
      }
      if (byId.size >= MAX_EVENTS) break;
    }
    const events = [...byId.values()].sort((left, right) => left.start.localeCompare(right.start));
    return { ok: true, events };
  } catch {
    return { ok: false };
  }
}

function expandEvent(
  event: VEvent,
  facts: FeedFacts,
  personId: string,
  window: { start: Date; end: Date },
): ExpandedEvent[] {
  if (event.status === "CANCELLED" || event.recurrenceid) return [];
  if (!(event.start instanceof Date)) return [];
  const allDay = event.datetype === "date" || facts.allDayStart !== null;
  const uid = textValue(event.uid) || "event";
  if (!event.rrule) {
    return [placed(event, facts, personId, uid, event.start, allDay, null)].filter((item) =>
      overlaps(item, window),
    );
  }

  const absolute = rruleReturnsAbsolute(event);
  const duration = durationMs(event, allDay);
  let raw: Date[] = [];
  try {
    raw = event.rrule.between(new Date(window.start.getTime() - duration - 86_400_000), window.end, true);
  } catch {
    return [];
  }
  const excluded = exdateInstants(event);
  const results: ExpandedEvent[] = [];
  for (const date of raw) {
    const occurrence = toInstant(date, event, absolute || allDay);
    if (allDay && facts.allDayExdates.has(utcDay(occurrence))) continue;
    if (!allDay && excluded.some((ex) => Math.abs(ex.getTime() - occurrence.getTime()) < 1000)) continue;
    const override = findOverride(event, occurrence);
    if (override?.status === "CANCELLED") continue;
    const item = placed(event, facts, personId, uid, occurrence, allDay, override);
    if (overlaps(item, window)) results.push(item);
  }
  return results;
}

function placed(
  master: VEvent,
  facts: FeedFacts,
  personId: string,
  uid: string,
  occurrence: Date,
  allDay: boolean,
  override: VEvent | null,
): ExpandedEvent {
  const source = override ?? master;
  const instanceAllDay = allDay || source.datetype === "date";
  const bounds = instanceBounds(master, facts, occurrence, instanceAllDay, override);
  const title = plainTitle(source.summary);
  return {
    externalId: externalId(personId, uid, occurrence, instanceAllDay),
    title,
    start: bounds.start.toISOString(),
    end: bounds.end.toISOString(),
    allDay: instanceAllDay,
    personId,
  };
}

function instanceBounds(
  master: VEvent,
  facts: FeedFacts,
  occurrence: Date,
  allDay: boolean,
  override: VEvent | null,
): { start: Date; end: Date } {
  if (override?.start instanceof Date && override.datetype !== "date") {
    const start = override.start;
    const end = override.end instanceof Date ? override.end : new Date(start.getTime() + durationMs(master, false));
    return ordered(start, end, false);
  }
  if (allDay) {
    const startParts = facts.allDayStart && !master.rrule ? parseDay(facts.allDayStart) : utcDateParts(occurrence);
    const span = facts.allDayStart && facts.allDayEnd ? daySpan(facts.allDayStart, facts.allDayEnd) : allDaySpanDays(master);
    return {
      start: zonedTimeToUtc({ ...startParts, hour: 0, minute: 0 }),
      end: zonedTimeToUtc({ ...addDays(startParts, Math.max(1, span)), hour: 0, minute: 0 }),
    };
  }
  const start = occurrence;
  const end = new Date(start.getTime() + durationMs(master, false));
  return ordered(start, end, false);
}

function ordered(start: Date, end: Date, allDay: boolean): { start: Date; end: Date } {
  if (end > start) return { start, end };
  return { start, end: new Date(start.getTime() + (allDay ? 86_400_000 : 60_000)) };
}

function rruleReturnsAbsolute(event: VEvent): boolean {
  if (!event.rrule || !(event.start instanceof Date)) return true;
  try {
    const near = event.rrule.between(new Date(event.start.getTime() - 1000), new Date(event.start.getTime() + 1000), true);
    return near.some((date) => Math.abs(date.getTime() - event.start.getTime()) < 1000);
  } catch {
    return true;
  }
}

function toInstant(date: Date, event: VEvent, alreadyAbsolute: boolean): Date {
  if (alreadyAbsolute) return date;
  const tz = event.rrule?.origOptions.tzid || event.start.tz || "UTC";
  try {
    return zonedTimeToUtc(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
      },
      tz,
    );
  } catch {
    return date;
  }
}

function findOverride(event: VEvent, occurrence: Date): VEvent | null {
  if (!event.recurrences) return null;
  const tz = event.start.tz || event.rrule?.origOptions.tzid;
  const days = new Set<string>([utcDay(occurrence)]);
  if (tz) {
    try {
      days.add(dateKey(zonedParts(occurrence, tz)));
    } catch {
      // An unknown zone still matches the UTC day.
    }
  }
  for (const [key, value] of Object.entries(event.recurrences)) {
    if (days.has(key.slice(0, 10))) return value as VEvent;
  }
  return null;
}

function exdateInstants(event: VEvent): Date[] {
  if (!event.exdate) return [];
  const values = Object.values(event.exdate as Record<string, unknown>);
  return values.filter((value): value is Date => value instanceof Date);
}

function durationMs(event: VEvent, allDay: boolean): number {
  if (event.end instanceof Date && event.start instanceof Date) {
    const ms = event.end.getTime() - event.start.getTime();
    if (ms > 0) return ms;
  }
  return allDay ? 86_400_000 : 3_600_000;
}

function allDaySpanDays(event: VEvent): number {
  return Math.max(1, Math.round(durationMs(event, true) / 86_400_000));
}

function overlaps(event: ExpandedEvent, window: { start: Date; end: Date }): boolean {
  const start = new Date(event.start);
  const end = new Date(event.end);
  return start < window.end && end > window.start;
}

function externalId(personId: string, uid: string, occurrence: Date, allDay: boolean): string {
  const stamp = allDay ? utcDay(occurrence).replaceAll("-", "") : occurrence.toISOString().replace(/\.\d{3}Z$/, "").replaceAll(/[-:]/g, "");
  const safeUid = uid.replace(/[^\w.@+-]+/g, "_").slice(0, 80);
  const raw = `ical:${personId}:${safeUid || "event"}:${stamp}`;
  if (raw.length <= 180) return raw;
  const hash = createHash("sha256").update(`${personId}:${uid}:${stamp}`).digest("hex").slice(0, 24);
  return `ical:${personId}:${hash}:${stamp}`;
}

function plainTitle(value: unknown): string {
  const text = plainText(textValue(value)).slice(0, 200);
  return text || ro.untitledEvent;
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "val" in value && typeof value.val === "string") return value.val;
  return "";
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDateParts(date: Date): DateParts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function parseDay(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

function daySpan(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 1;
  return Math.round((to - from) / 86_400_000);
}

function emptyFacts(): FeedFacts {
  return { allDayStart: null, allDayEnd: null, allDayExdates: new Set() };
}

function readFeedFacts(ics: string): Map<string, FeedFacts> {
  const facts = new Map<string, FeedFacts>();
  const unfolded = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0] ?? "";
    const uid = lineValue(body, "UID");
    if (!uid) continue;
    const entry = facts.get(uid) ?? emptyFacts();
    const start = dateOnly(body, "DTSTART");
    const end = dateOnly(body, "DTEND");
    if (start) entry.allDayStart = start;
    if (end) entry.allDayEnd = end;
    for (const line of body.split("\n")) {
      if (!line.startsWith("EXDATE") || !line.includes("VALUE=DATE")) continue;
      const value = line.split(":").pop() ?? "";
      for (const part of value.split(",")) {
        const match = /^(\d{4})(\d{2})(\d{2})$/.exec(part.trim());
        if (match) entry.allDayExdates.add(`${match[1]}-${match[2]}-${match[3]}`);
      }
    }
    facts.set(uid, entry);
  }
  return facts;
}

function lineValue(block: string, name: string): string | null {
  for (const line of block.split("\n")) {
    if (line.startsWith(`${name}:`) || line.startsWith(`${name};`)) {
      return line.split(":").pop()?.trim() || null;
    }
  }
  return null;
}

function dateOnly(block: string, name: string): string | null {
  for (const line of block.split("\n")) {
    if (!line.startsWith(name) || !line.includes("VALUE=DATE")) continue;
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec((line.split(":").pop() ?? "").trim());
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}
