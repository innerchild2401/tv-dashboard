export const CALENDAR_INTERVAL_MS = 5 * 60 * 1000;
export const WEATHER_INTERVAL_MS = 30 * 60 * 1000;
export const ANALYTICS_INTERVAL_MS = 15 * 60 * 1000;
export const TIKTOK_INTERVAL_MS = 60 * 60 * 1000;
export const CALENDAR_WINDOW_DAYS = 45;

export function shouldRefresh(attemptedAt: string | null | undefined, now: Date, intervalMs: number): boolean {
  if (!attemptedAt) return true;
  const then = Date.parse(attemptedAt);
  if (!Number.isFinite(then)) return true;
  return now.getTime() - then >= intervalMs;
}
