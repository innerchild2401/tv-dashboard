import { addDays, dateKey, endOfZonedDay, zonedParts, zonedTimeToUtc, type DateParts } from "@/lib/time/bucharest";

export function bucharestDate(now: Date): string {
  return dateKey(zonedParts(now));
}

export function endOfToday(now: Date): string {
  return endOfZonedDay(zonedParts(now)).toISOString();
}

export function parseInstant(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const local = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!local) return null;
  const hour = Number(local[4]);
  const minute = Number(local[5]);
  if (hour > 23 || minute > 59) return null;
  return zonedTimeToUtc({
    year: Number(local[1]),
    month: Number(local[2]),
    day: Number(local[3]),
    hour,
    minute,
  }).toISOString();
}

export function findAppointment(text: string, now: Date): { start: string; end: string } | null {
  const iso = text.match(/\d{4}-\d{2}-\d{2}[tT ]\d{1,2}:\d{2}(?::\d{2})?(?:[zZ]|[+-]\d{2}:\d{2})?/);
  if (iso) {
    const start = parseInstant(iso[0]);
    if (!start) return null;
    return { start, end: new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString() };
  }
  const full = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b(?:\D{0,16})(\d{1,2}):(\d{2})\b/);
  if (full) {
    return span(Number(full[3]), Number(full[2]), Number(full[1]), Number(full[4]), Number(full[5]));
  }
  const folded = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const clock = clockOf(folded);
  if (!clock) return null;
  const today = zonedParts(now);
  const day = relativeDay(folded);
  if (day !== null) {
    const date = addDays(today, day);
    return span(date.year, date.month, date.day, clock.hour, clock.minute);
  }
  const short = folded.match(/\b(\d{1,2})\.(\d{1,2})\b(?:\D{0,16})(\d{1,2}):(\d{2})\b/);
  if (short) {
    return span(today.year, Number(short[2]), Number(short[1]), Number(short[3]), Number(short[4]));
  }
  return null;
}

function relativeDay(text: string): number | null {
  if (/\bpoimaine\b/.test(text)) return 2;
  if (/\bmaine\b/.test(text)) return 1;
  if (/\b(azi|astazi)\b/.test(text)) return 0;
  return null;
}

function clockOf(text: string): { hour: number; minute: number } | null {
  const explicit = text.match(/\b(?:la|ora)\s+(\d{1,2})(?::(\d{2}))?\b/);
  const plain = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const match = explicit ?? plain;
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function span(year: number, month: number, day: number, hour: number, minute: number): { start: string; end: string } | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const date: DateParts = { year, month, day };
  const start = zonedTimeToUtc({ ...date, hour, minute });
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}
