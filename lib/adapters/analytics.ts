import { addDays, dateKey, zonedParts } from "@/lib/time/bucharest";

export type AnalyticsProviderId = "plausible" | "umami" | "ga4";

export type AnalyticsReport = {
  days: { date: string; visitors: number }[];
  pages: { name: string; visitors: number }[];
  sources: { name: string; visitors: number }[];
};

export type MetricDraft = { key: string; value: number; previous: number | null };

export type AnalyticsFetch =
  | { status: "unconfigured" }
  | { status: "failed" }
  | { status: "updated"; report: AnalyticsReport };

type Env = Record<string, string | undefined>;

export type AnalyticsAdapter = {
  id: AnalyticsProviderId;
  configured(env: Env): boolean;
  parse(body: unknown): AnalyticsReport | null;
  fetch(env: Env, fetchImpl: typeof fetch, now: Date): Promise<AnalyticsReport | null>;
};

const PROVIDERS: AnalyticsProviderId[] = ["plausible", "umami", "ga4"];

export function analyticsProvider(env: Env = process.env): AnalyticsProviderId | null {
  const raw = env.ANALYTICS_PROVIDER?.trim().toLowerCase();
  if (raw === "plausible" || raw === "umami" || raw === "ga4") return raw;
  return null;
}

export function analyticsAdapter(env: Env = process.env): AnalyticsAdapter | null {
  const id = analyticsProvider(env);
  if (!id) return null;
  const adapter = ADAPTERS[id];
  return adapter.configured(env) ? adapter : null;
}

export async function fetchAnalytics(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<AnalyticsFetch> {
  const adapter = analyticsAdapter(env);
  if (!adapter) return { status: "unconfigured" };
  try {
    const report = await adapter.fetch(env, fetchImpl, now);
    if (!report || report.days.length === 0) return { status: "failed" };
    return { status: "updated", report };
  } catch {
    return { status: "failed" };
  }
}

export function reportToMetrics(report: AnalyticsReport, now: Date): MetricDraft[] {
  const days = [...report.days].sort((left, right) => left.date.localeCompare(right.date)).slice(-30);
  const rows: MetricDraft[] = days.map((day) => ({
    key: `site.day.${day.date}`,
    value: day.visitors,
    previous: null,
  }));
  const today = dateKey(zonedParts(now));
  const byDate = new Map(days.map((day) => [day.date, day.visitors]));
  const todayValue = byDate.get(today) ?? days.at(-1)?.visitors ?? 0;
  const yesterday = dateKey(addDays(zonedParts(now), -1));
  const sum = (fromAgo: number, toAgo: number) => {
    let total = 0;
    for (let ago = fromAgo; ago <= toAgo; ago += 1) {
      total += byDate.get(dateKey(addDays(zonedParts(now), -ago))) ?? 0;
    }
    return total;
  };
  const week = sum(0, 6);
  const previousWeek = sum(7, 13);
  const month = days.reduce((total, day) => total + day.visitors, 0);
  rows.push(
    { key: "site.visitors.today", value: todayValue, previous: byDate.get(yesterday) ?? null },
    { key: "site.visitors.7d", value: week, previous: previousWeek > 0 ? previousWeek : null },
    { key: "site.visitors.30d", value: month, previous: null },
  );
  for (const page of report.pages.slice(0, 4)) {
    rows.push({ key: `site.page.${slug(page.name)}`, value: page.visitors, previous: null });
  }
  for (const source of report.sources.slice(0, 4)) {
    rows.push({ key: `site.source.${slug(source.name)}`, value: source.visitors, previous: null });
  }
  return rows;
}

const ADAPTERS: Record<AnalyticsProviderId, AnalyticsAdapter> = {
  plausible: {
    id: "plausible",
    configured: (env) => Boolean(clean(env.PLAUSIBLE_API_KEY) && clean(env.PLAUSIBLE_SITE_ID)),
    parse: parsePlausible,
    async fetch(env, fetchImpl) {
      const base = (clean(env.PLAUSIBLE_API_URL) || "https://plausible.io").replace(/\/$/, "");
      const site = clean(env.PLAUSIBLE_SITE_ID);
      const key = clean(env.PLAUSIBLE_API_KEY);
      if (!site || !key) return null;
      const [timeseries, pages, sources] = await Promise.all([
        getJson(fetchImpl, `${base}/api/v1/stats/timeseries?site_id=${encodeURIComponent(site)}&period=30d`, key),
        getJson(fetchImpl, `${base}/api/v1/stats/breakdown?site_id=${encodeURIComponent(site)}&period=30d&property=event:page&limit=4`, key),
        getJson(fetchImpl, `${base}/api/v1/stats/breakdown?site_id=${encodeURIComponent(site)}&period=30d&property=visit:source&limit=4`, key),
      ]);
      return parsePlausible({ timeseries, pages, sources });
    },
  },
  umami: {
    id: "umami",
    configured: (env) => Boolean(clean(env.UMAMI_API_URL) && clean(env.UMAMI_API_KEY) && clean(env.UMAMI_WEBSITE_ID)),
    parse: parseUmami,
    async fetch(env, fetchImpl, now) {
      const base = clean(env.UMAMI_API_URL)?.replace(/\/$/, "");
      const key = clean(env.UMAMI_API_KEY);
      const website = clean(env.UMAMI_WEBSITE_ID);
      if (!base || !key || !website) return null;
      const endAt = now.getTime();
      const startAt = endAt - 30 * 24 * 60 * 60 * 1000;
      const query = `startAt=${startAt}&endAt=${endAt}`;
      const root = `${base}/api/websites/${encodeURIComponent(website)}`;
      const [pageviews, pages, sources] = await Promise.all([
        getJson(fetchImpl, `${root}/pageviews?${query}&unit=day`, key),
        getJson(fetchImpl, `${root}/metrics?${query}&type=url`, key),
        getJson(fetchImpl, `${root}/metrics?${query}&type=referrer`, key),
      ]);
      return parseUmami({ pageviews, pages, sources });
    },
  },
  ga4: {
    id: "ga4",
    configured: (env) => Boolean(clean(env.GA4_PROPERTY_ID) && clean(env.GA4_ACCESS_TOKEN)),
    parse: parseGa4,
    async fetch(env, fetchImpl) {
      const property = clean(env.GA4_PROPERTY_ID);
      const token = clean(env.GA4_ACCESS_TOKEN);
      if (!property || !token) return null;
      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`;
      const [days, pages, sources] = await Promise.all([
        postJson(fetchImpl, url, token, ga4Body("date")),
        postJson(fetchImpl, url, token, ga4Body("pagePath")),
        postJson(fetchImpl, url, token, ga4Body("sessionSource")),
      ]);
      return parseGa4({ days, pages, sources });
    },
  },
};

export function parsePlausible(body: unknown): AnalyticsReport | null {
  const record = asRecord(body);
  if (!record) return null;
  const days = points(record.timeseries ?? record, "date", "visitors");
  if (days.length === 0 && !record.timeseries) return null;
  return {
    days,
    pages: points(record.pages, "page", "visitors").map((item) => ({ name: item.date, visitors: item.visitors })),
    sources: points(record.sources, "source", "visitors").map((item) => ({ name: item.date, visitors: item.visitors })),
  };
}

export function parseUmami(body: unknown): AnalyticsReport | null {
  const record = asRecord(body);
  if (!record) return null;
  const series = asRecord(record.pageviews);
  const days = umamiPoints(series?.pageviews ?? record.pageviews ?? record.days);
  if (days.length === 0) return null;
  return {
    days,
    pages: umamiPoints(record.pages).map((item) => ({ name: item.date, visitors: item.visitors })),
    sources: umamiPoints(record.sources).map((item) => ({ name: item.date, visitors: item.visitors })),
  };
}

export function parseGa4(body: unknown): AnalyticsReport | null {
  const record = asRecord(body);
  if (!record) return null;
  const days = ga4Rows(record.days ?? record).map((row) => ({ date: ga4Date(row.name), visitors: row.visitors }));
  if (days.length === 0 || days.some((day) => !day.date)) return null;
  return {
    days,
    pages: ga4Rows(record.pages),
    sources: ga4Rows(record.sources),
  };
}

export const ANALYTICS_PROVIDER_IDS = PROVIDERS;

function ga4Body(dimension: string): unknown {
  return {
    dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: "activeUsers" }],
    limit: dimension === "date" ? 30 : 4,
    orderBys: dimension === "date" ? [{ dimension: { dimensionName: "date" } }] : [{ metric: { metricName: "activeUsers" }, desc: true }],
  };
}

function points(body: unknown, nameKey: string, valueKey: string): { date: string; visitors: number }[] {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : record?.results;
  if (!Array.isArray(list)) return [];
  const rows: { date: string; visitors: number }[] = [];
  for (const item of list) {
    const fields = asRecord(item);
    if (!fields) continue;
    const name = fields[nameKey];
    const visitors = finite(fields[valueKey]);
    if (typeof name !== "string" || visitors === null) continue;
    rows.push({ date: name, visitors });
  }
  return rows;
}

function umamiPoints(body: unknown): { date: string; visitors: number }[] {
  if (!Array.isArray(body)) return [];
  const rows: { date: string; visitors: number }[] = [];
  for (const item of body) {
    const fields = asRecord(item);
    if (!fields) continue;
    const name = fields.x ?? fields.t;
    const visitors = finite(fields.y ?? fields.v);
    if (typeof name !== "string" || visitors === null) continue;
    rows.push({ date: name.slice(0, 10), visitors });
  }
  return rows;
}

function ga4Rows(body: unknown): { name: string; visitors: number }[] {
  const record = asRecord(body);
  const list = record?.rows;
  if (!Array.isArray(list)) return [];
  const rows: { name: string; visitors: number }[] = [];
  for (const item of list) {
    const fields = asRecord(item);
    const dimensions = Array.isArray(fields?.dimensionValues) ? fields.dimensionValues : [];
    const metrics = Array.isArray(fields?.metricValues) ? fields.metricValues : [];
    const name = asRecord(dimensions[0])?.value;
    const visitors = finite(asRecord(metrics[0])?.value);
    if (typeof name !== "string" || visitors === null) continue;
    rows.push({ name, visitors });
  }
  return rows;
}

function ga4Date(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

async function getJson(fetchImpl: typeof fetch, url: string, key: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}

async function postJson(fetchImpl: typeof fetch, url: string, key: string, body: unknown): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}

function slug(name: string): string {
  const cleaned = name.trim().toLowerCase();
  if (cleaned === "/" || cleaned === "") return "acasa";
  const text = cleaned
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return text || "alta";
}

function clean(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
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
