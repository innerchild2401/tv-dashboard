import { ro } from "@/i18n/ro";

export function formatCount(value: number): string {
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(value);
}

export function formatPercentDelta(value: number, previous: number | null): string | null {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((value - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return "0%";
  const sign = pct > 0 ? "+" : "−";
  return `${sign}${Math.abs(pct)}%`;
}

export function formatAge(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${ro.updated} ${minutes} min`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return `${ro.updated} ${hours} h`;
}

export function updatedLabel(fetchedAt: string | null, now: Date, thresholdMs: number): string | null {
  if (!fetchedAt) return null;
  const age = now.getTime() - new Date(fetchedAt).getTime();
  if (!Number.isFinite(age) || age <= thresholdMs) return null;
  return formatAge(age);
}

export function sourcedLabel(
  origin: "live" | "sample" | "kept",
  fetchedAt: string | null,
  now: Date,
  thresholdMs: number,
): string | null {
  const age = updatedLabel(fetchedAt, now, thresholdMs);
  if (origin === "live") return age;
  if (origin === "kept") return age ?? ro.keptData;
  return age ? `${ro.sampleData} · ${age}` : ro.sampleData;
}
