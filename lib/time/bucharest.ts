export const TIME_ZONE = "Europe/Bucharest";

export type DateParts = {
  year: number;
  month: number;
  day: number;
};

export type ZonedParts = DateParts & {
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(date: Date, timeZone = TIME_ZONE): ZonedParts {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }

  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;

  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function addDays(parts: DateParts, days: number): DateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function zonedTimeToUtc(
  parts: DateParts & { hour: number; minute: number },
  timeZone = TIME_ZONE,
): Date {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  let utc = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const got = zonedParts(new Date(utc), timeZone);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const diff = desired - gotAsUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export function endOfZonedDay(parts: DateParts, timeZone = TIME_ZONE): Date {
  return zonedTimeToUtc({ ...addDays(parts, 1), hour: 0, minute: 0 }, timeZone);
}

export function dateKey(parts: DateParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatClock(date: Date, timeZone = TIME_ZONE): string {
  const parts = zonedParts(date, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatLongDate(date: Date, timeZone = TIME_ZONE): string {
  return capitalize(
    new Intl.DateTimeFormat("ro-RO", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date),
  );
}

export function formatShortDate(date: Date, timeZone = TIME_ZONE): string {
  return capitalize(
    new Intl.DateTimeFormat("ro-RO", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date),
  );
}

/** Momente TV due label, e.g. "13 nov · 18:00" in Europe/Bucharest. */
export function formatMomenteDue(date: Date | string, timeZone = TIME_ZONE): string {
  const instant = typeof date === "string" ? new Date(date) : date;
  const parts = zonedParts(instant, timeZone);
  const month = new Intl.DateTimeFormat("ro-RO", {
    timeZone,
    month: "short",
  })
    .format(instant)
    .replace(/\.$/, "")
    .toLocaleLowerCase("ro-RO");
  return `${parts.day} ${month} · ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours} h ${pad(rest)} min`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("ro-RO") + value.slice(1);
}
