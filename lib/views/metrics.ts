import { ro } from "@/i18n/ro";
import { formatCount, formatPercentDelta, sourcedLabel } from "@/lib/format/display";
import { SAMPLE_VIDEO_TITLE, SITE_FRESH_MS, TIKTOK_FRESH_MS } from "@/lib/seed/sample-metrics";
import type { SiteModel, Snapshot, SnapshotMetric, StatModel, TikTokModel } from "@/lib/state/types";
import { zonedTimeToUtc } from "@/lib/time/bucharest";

const PAGE_LABELS: Record<string, string> = {
  "site.page.acasa": "Acasă",
  "site.page.jurnal": "Jurnal",
  "site.page.despre": "Despre",
};

const SOURCE_LABELS: Record<string, string> = {
  "site.source.direct": "Direct",
  "site.source.search": "Căutare",
  "site.source.social": "Social",
};

export function projectSite(snapshot: Snapshot, now: Date): SiteModel {
  const days = series(snapshot.metrics, "site.day.");
  const today = metric(snapshot.metrics, "site.visitors.today");
  const week = metric(snapshot.metrics, "site.visitors.7d");
  const month = metric(snapshot.metrics, "site.visitors.30d");
  const todayValue = today?.value ?? days.at(-1)?.value ?? 0;
  const weekValue = week?.value ?? sumLast(days, 7);
  const monthValue = month?.value ?? days.reduce((sum, point) => sum + point.value, 0);
  return {
    stats: [
      stat(ro.todayStat, todayValue, today?.previous ?? days.at(-2)?.value ?? null),
      stat(ro.sevenDays, weekValue, week?.previous ?? null),
      stat(ro.thirtyDays, monthValue, month?.previous ?? null),
    ],
    series: days.map((point) => point.value),
    updatedLabel: sourcedLabel(metricOrigin(snapshot.metrics, "site.", now, SITE_FRESH_MS), newest(snapshot.metrics, "site."), now, SITE_FRESH_MS),
    pages: ranked(snapshot.metrics, "site.page.", PAGE_LABELS),
    sources: ranked(snapshot.metrics, "site.source.", SOURCE_LABELS),
    celebration: null,
  };
}

export function projectTikTok(snapshot: Snapshot, now: Date): TikTokModel {
  const followers = metric(snapshot.metrics, "tiktok.followers");
  const views = metric(snapshot.metrics, "tiktok.views.7d");
  const likes = metric(snapshot.metrics, "tiktok.likes.7d");
  const days = series(snapshot.metrics, "tiktok.views.day.");
  const videoViews = metric(snapshot.metrics, "tiktok.video.views");
  const videoLikes = metric(snapshot.metrics, "tiktok.video.likes");
  const videoTitle = snapshot.tiktokVideoTitle?.trim() || (videoViews?.source === "integration" ? ro.lastVideo : SAMPLE_VIDEO_TITLE);
  return {
    followers: stat(ro.followers, followers?.value ?? 0, followers?.previous ?? null),
    views: stat(ro.viewsLabel, views?.value ?? sumLast(days, 7), views?.previous ?? null),
    likes: stat(ro.likes, likes?.value ?? 0, likes?.previous ?? null),
    bars: days.map((point) => ({
      label: weekday(point.key),
      value: point.value,
    })),
    video: videoViews
      ? {
          title: videoTitle,
          views: formatCount(videoViews.value),
          likes: formatCount(videoLikes?.value ?? 0),
        }
      : null,
    updatedLabel: sourcedLabel(
      metricOrigin(snapshot.metrics, "tiktok.", now, TIKTOK_FRESH_MS),
      newest(snapshot.metrics, "tiktok."),
      now,
      TIKTOK_FRESH_MS,
    ),
    celebration: null,
  };
}

function stat(label: string, value: number, previous: number | null): StatModel {
  return { label, value: formatCount(value), delta: formatPercentDelta(value, previous) };
}

function metric(metrics: SnapshotMetric[], key: string): SnapshotMetric | undefined {
  return metrics.find((item) => item.key === key);
}

function series(metrics: SnapshotMetric[], prefix: string): { key: string; value: number }[] {
  return metrics
    .filter((item) => item.key.startsWith(prefix))
    .map((item) => ({ key: item.key.slice(prefix.length), value: item.value }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function sumLast(points: { value: number }[], count: number): number {
  return points.slice(-count).reduce((sum, point) => sum + point.value, 0);
}

function metricOrigin(metrics: SnapshotMetric[], prefix: string, now: Date, freshMs: number): "live" | "sample" | "kept" {
  const rows = metrics.filter((metric) => metric.key.startsWith(prefix) && metric.source === "integration");
  if (rows.length === 0) return "sample";
  let newest = 0;
  for (const row of rows) {
    const time = new Date(row.fetchedAt).getTime();
    if (time > newest) newest = time;
  }
  return now.getTime() - newest > freshMs ? "kept" : "live";
}

function newest(metrics: SnapshotMetric[], prefix: string): string | null {
  let found: string | null = null;
  for (const item of metrics) {
    if (!item.key.startsWith(prefix)) continue;
    if (!found || item.fetchedAt > found) found = item.fetchedAt;
  }
  return found;
}

function ranked(metrics: SnapshotMetric[], prefix: string, labels: Record<string, string>): { label: string; value: string }[] {
  return metrics
    .filter((item) => item.key.startsWith(prefix))
    .sort((left, right) => right.value - left.value)
    .slice(0, 4)
    .map((item) => ({
      label: labels[item.key] ?? item.key.slice(prefix.length),
      value: formatCount(item.value),
    }));
}

function weekday(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  const date = zonedTimeToUtc({ year, month, day, hour: 12, minute: 0 });
  const text = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", weekday: "short" }).format(date);
  return text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1).replace(".", "");
}
