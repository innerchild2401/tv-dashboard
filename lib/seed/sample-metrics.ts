import { addDays, dateKey, zonedParts } from "@/lib/time/bucharest";

export const SAMPLE_VIDEO_TITLE = "Dimineața la mal";

export const SITE_FRESH_MS = 15 * 60 * 1000;
export const TIKTOK_FRESH_MS = 60 * 60 * 1000;
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type SampleMetric = {
  key: string;
  value: number;
  previous: number | null;
  fetchedAt: string;
  source: "manual" | "assistant" | "integration";
  externalId: string;
};

export function siteDayValue(daysAgo: number): number {
  const index = 29 - daysAgo;
  return 80 + ((index * 17) % 50);
}

export function tiktokDayViews(daysAgo: number): number {
  const index = 6 - daysAgo;
  return 4200 + ((index * 137) % 1800);
}

export function sampleMetrics(now: Date): SampleMetric[] {
  const fetchedAt = now.toISOString();
  const parts = zonedParts(now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  const rows: SampleMetric[] = [];

  let todayValue = 0;
  let yesterdayValue = 0;
  let week = 0;
  let previousWeek = 0;
  let month = 0;

  for (let daysAgo = 29; daysAgo >= 0; daysAgo -= 1) {
    const value = siteDayValue(daysAgo);
    const day = addDays(today, -daysAgo);
    const keyDate = dateKey(day);
    rows.push({
      key: `site.day.${keyDate}`,
      value,
      previous: null,
      fetchedAt,
      source: "manual",
      externalId: `metric-site-day-${keyDate}`,
    });
    month += value;
    if (daysAgo === 0) todayValue = value;
    if (daysAgo === 1) yesterdayValue = value;
    if (daysAgo <= 6) week += value;
    if (daysAgo >= 7 && daysAgo <= 13) previousWeek += value;
  }

  let tiktokWeek = 0;
  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    const value = tiktokDayViews(daysAgo);
    const day = addDays(today, -daysAgo);
    const keyDate = dateKey(day);
    tiktokWeek += value;
    rows.push({
      key: `tiktok.views.day.${keyDate}`,
      value,
      previous: null,
      fetchedAt,
      source: "manual",
      externalId: `metric-tiktok-day-${keyDate}`,
    });
  }

  const headlines: SampleMetric[] = [
    metric("site.visitors.today", todayValue, yesterdayValue, fetchedAt),
    metric("site.visitors.7d", week, previousWeek, fetchedAt),
    metric("site.visitors.30d", month, Math.round(month * 0.94), fetchedAt),
    metric("site.page.acasa", 420, null, fetchedAt),
    metric("site.page.jurnal", 180, null, fetchedAt),
    metric("site.page.despre", 96, null, fetchedAt),
    metric("site.source.direct", 310, null, fetchedAt),
    metric("site.source.search", 250, null, fetchedAt),
    metric("site.source.social", 136, null, fetchedAt),
    metric("tiktok.followers", 12840, 12710, fetchedAt),
    metric("tiktok.views.7d", tiktokWeek, Math.round(tiktokWeek * 0.88), fetchedAt),
    metric("tiktok.likes.7d", 3100, 2740, fetchedAt),
    metric("tiktok.video.views", 8200, null, fetchedAt),
    metric("tiktok.video.likes", 640, null, fetchedAt),
  ];

  return [...rows, ...headlines];
}

function metric(key: string, value: number, previous: number | null, fetchedAt: string): SampleMetric {
  return {
    key,
    value,
    previous,
    fetchedAt,
    source: "manual",
    externalId: `metric-${key.split(".").join("-")}`,
  };
}
