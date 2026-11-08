import { dateKey, zonedParts, zonedTimeToUtc } from "@/lib/time/bucharest";

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = zonedParts(new Date(iso));
  return `${dateKey(parts)}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function fromLocalInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return zonedTimeToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }).toISOString();
}
