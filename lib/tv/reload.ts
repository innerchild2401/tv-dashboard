import { dateKey, zonedParts } from "@/lib/time/bucharest";

export const NIGHTLY_RELOAD_HOUR = 4;
export const NIGHTLY_RELOAD_KEY = "tv-nightly-reload";

export function nightlyReloadKey(now: Date): string | null {
  const parts = zonedParts(now);
  if (parts.hour !== NIGHTLY_RELOAD_HOUR) return null;
  return dateKey(parts);
}

export function shouldNightlyReload(now: Date, alreadyReloadedKey: string | null): boolean {
  const key = nightlyReloadKey(now);
  if (!key) return false;
  return alreadyReloadedKey !== key;
}
