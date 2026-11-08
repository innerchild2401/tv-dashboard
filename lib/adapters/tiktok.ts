import { addDays, dateKey, zonedParts } from "@/lib/time/bucharest";
import type { MetricDraft } from "@/lib/adapters/analytics";

export const ZERNIO_DEFAULT_URL = "https://api.zernio.com";

export type TikTokReport = {
  followers: number | null;
  followersPrevious: number | null;
  days: { date: string; views: number }[];
  likes7d: number | null;
  likesPrevious: number | null;
  video: { title: string; views: number; likes: number } | null;
};

export type TikTokFetch =
  | { status: "unconfigured" }
  | { status: "failed" }
  | { status: "updated"; report: TikTokReport };

type Env = Record<string, string | undefined>;

export function zernioConfigured(env: Env = process.env): boolean {
  return Boolean(env.ZERNIO_API_KEY?.trim());
}

export async function fetchTikTok(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<TikTokFetch> {
  const key = env.ZERNIO_API_KEY?.trim();
  if (!key) return { status: "unconfigured" };
  try {
    const base = (env.ZERNIO_API_URL?.trim() || ZERNIO_DEFAULT_URL).replace(/\/$/, "");
    const from = dateKey(addDays(zonedParts(now), -13));
    const to = dateKey(zonedParts(now));
    const headers = { authorization: `Bearer ${key}`, accept: "application/json" };
    const postsUrl = `${base}/v1/analytics?platform=tiktok&fromDate=${from}&toDate=${to}&limit=50`;
    const followersUrl = `${base}/v1/accounts/follower-stats?fromDate=${from}&toDate=${to}`;
    const account = env.ZERNIO_ACCOUNT_ID?.trim();
    const insightsUrl = account
      ? `${base}/v1/analytics/tiktok/account-insights?accountId=${encodeURIComponent(account)}&metricType=time_series&fromDate=${from}&toDate=${to}`
      : null;
    const [posts, followers, insights] = await Promise.all([
      getJson(fetchImpl, postsUrl, headers),
      getJson(fetchImpl, followersUrl, headers),
      insightsUrl ? getJson(fetchImpl, insightsUrl, headers) : Promise.resolve(null),
    ]);
    const report = parseZernio({ posts, followers, insights }, now);
    if (!report) return { status: "failed" };
    return { status: "updated", report };
  } catch {
    return { status: "failed" };
  }
}

export function parseZernio(
  body: { posts?: unknown; followers?: unknown; insights?: unknown } | unknown,
  now: Date,
): TikTokReport | null {
  const record = asRecord(body);
  const postsBody = record && ("posts" in record || "followers" in record || "insights" in record) ? record.posts : body;
  const followersBody = record?.followers ?? null;
  const insightsBody = record?.insights ?? (record?.metrics ? body : null);
  const posts = readPosts(postsBody);
  const account = readFollowers(followersBody) ?? readFollowers(insightsBody);
  if (posts.length === 0 && !account) return null;

  const today = zonedParts(now);
  const views = new Map<string, number>();
  const likesByDay = new Map<string, number>();
  for (let ago = 6; ago >= 0; ago -= 1) views.set(dateKey(addDays(today, -ago)), 0);
  for (const post of posts) {
    const key = dateKey(zonedParts(post.at));
    if (!views.has(key)) continue;
    views.set(key, (views.get(key) ?? 0) + post.views);
    likesByDay.set(key, (likesByDay.get(key) ?? 0) + post.likes);
  }
  const days = [...views.entries()].map(([date, value]) => ({ date, views: value }));
  const likes7d = posts.length > 0 ? [...likesByDay.values()].reduce((sum, value) => sum + value, 0) : null;
  const latest = posts.reduce<(typeof posts)[number] | null>((best, post) => (!best || post.at > best.at ? post : best), null);
  return {
    followers: account?.current ?? null,
    followersPrevious: account?.previous ?? null,
    days,
    likes7d,
    likesPrevious: null,
    video: latest ? { title: latest.title, views: latest.views, likes: latest.likes } : null,
  };
}

export function tiktokToMetrics(report: TikTokReport): MetricDraft[] {
  const rows: MetricDraft[] = [];
  if (report.followers !== null) {
    rows.push({ key: "tiktok.followers", value: report.followers, previous: report.followersPrevious });
  }
  if (report.days.length > 0) {
    const week = report.days.reduce((sum, day) => sum + day.views, 0);
    rows.push({ key: "tiktok.views.7d", value: week, previous: null });
    for (const day of report.days) {
      rows.push({ key: `tiktok.views.day.${day.date}`, value: day.views, previous: null });
    }
  }
  if (report.likes7d !== null) {
    rows.push({ key: "tiktok.likes.7d", value: report.likes7d, previous: report.likesPrevious });
  }
  if (report.video) {
    rows.push({ key: "tiktok.video.views", value: report.video.views, previous: null });
    rows.push({ key: "tiktok.video.likes", value: report.video.likes, previous: null });
  }
  return rows;
}

function readPosts(body: unknown): { at: Date; title: string; views: number; likes: number }[] {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : record?.posts;
  if (!Array.isArray(list)) return [];
  const posts: { at: Date; title: string; views: number; likes: number }[] = [];
  for (const item of list) {
    const fields = asRecord(item);
    if (!fields) continue;
    const analytics = asRecord(fields.analytics) ?? fields;
    const views = finite(analytics.views);
    const likes = finite(analytics.likes);
    const at = typeof fields.publishedAt === "string" ? new Date(fields.publishedAt) : null;
    if (views === null || likes === null || !at || !Number.isFinite(at.getTime())) continue;
    const title = text(fields.title) || text(fields.content) || text(fields.platformPostUrl) || "Ultimul video";
    posts.push({ at, title: title.slice(0, 120), views, likes });
  }
  return posts;
}

function readFollowers(body: unknown): { current: number; previous: number | null } | null {
  const record = asRecord(body);
  if (!record) return null;
  const metrics = asRecord(record.metrics);
  const series = asRecord(metrics?.follower_count);
  if (series) {
    const values = Array.isArray(series.values) ? series.values : [];
    const numbers = values.flatMap((item) => {
      const fields = asRecord(item);
      const value = finite(fields?.value);
      return value === null ? [] : [value];
    });
    const total = finite(series.total) ?? numbers.at(-1) ?? null;
    if (total === null) return null;
    return { current: total, previous: numbers.length >= 2 ? (numbers.at(-2) ?? null) : null };
  }
  const accounts = Array.isArray(record.accounts) ? record.accounts : [];
  for (const account of accounts) {
    const fields = asRecord(account);
    if (!fields) continue;
    const platform = typeof fields.platform === "string" ? fields.platform.toLowerCase() : "tiktok";
    if (platform !== "tiktok") continue;
    const stats = asRecord(fields.stats) ?? fields;
    const current = finite(stats.followers ?? stats.follower_count ?? stats.followerCount);
    if (current === null) continue;
    const previous = finite(stats.previousFollowers ?? stats.previous);
    return { current, previous };
  }
  return null;
}

async function getJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  return response.json();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.max(0, Math.round(Number(value)));
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
