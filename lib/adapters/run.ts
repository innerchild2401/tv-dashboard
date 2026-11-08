import { analyticsAdapter, fetchAnalytics, reportToMetrics } from "@/lib/adapters/analytics";
import { storeMetrics } from "@/lib/adapters/metrics-write";
import { calendarUrlFromEnv, fetchText, outcomeFromFeed, type FeedOutcome } from "@/lib/adapters/policy";
import { ANALYTICS_INTERVAL_MS, CALENDAR_INTERVAL_MS, shouldRefresh, TIKTOK_INTERVAL_MS, WEATHER_INTERVAL_MS } from "@/lib/adapters/intervals";
import { fetchTikTok, tiktokToMetrics, zernioConfigured } from "@/lib/adapters/tiktok";
import { DEFAULT_LOCATION, openMeteoUrl, parseForecast, parseOpenMeteo, type ForecastHour } from "@/lib/adapters/weather";
import { createServiceClient } from "@/lib/db/server";
import { configSchema } from "@/lib/schemas";
import type { Json } from "@/lib/db/database.types";

export type PersonRefresh = { id: string; status: FeedOutcome["status"] | "unavailable" };

type CacheRow = {
  key: string;
  etag: string | null;
  attempted_at: string | null;
  fetched_at: string | null;
  payload: Json;
  ok: boolean;
};

type Client = ReturnType<typeof createServiceClient>;

export async function refreshDueIntegrations(now = new Date()): Promise<void> {
  const supabase = createServiceClient();
  await Promise.all([
    refreshCalendars(now, supabase).catch(() => undefined),
    refreshWeather(now, supabase).catch(() => undefined),
    refreshAnalytics(now, supabase).catch(() => undefined),
    refreshTikTok(now, supabase).catch(() => undefined),
  ]);
}

export async function refreshCalendars(now = new Date(), supabase = createServiceClient()): Promise<{ people: PersonRefresh[] }> {
  const people = await loadPeople(supabase);
  const peopleStatus = await Promise.all(people.map((person) => refreshPerson(supabase, person.id, now)));
  return { people: peopleStatus };
}

export async function refreshWeather(
  now = new Date(),
  supabase = createServiceClient(),
): Promise<{ status: "skipped" | "updated" | "failed" | "unavailable" }> {
  const location = await loadLocation(supabase);
  const row = await readCache(supabase, "weather");
  if (row === "unavailable") return { status: "unavailable" };
  if (row && !shouldRefresh(row.attempted_at, now, WEATHER_INTERVAL_MS)) return { status: "skipped" };
  if (!(await claim(supabase, "weather", now))) return { status: "unavailable" };

  let body: unknown;
  try {
    const response = await fetch(openMeteoUrl(location.latitude, location.longitude), {
      headers: { accept: "application/json", "user-agent": "tv-dashboard" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: "failed" };
    body = await response.json();
  } catch {
    return { status: "failed" };
  }
  const parsed = parseOpenMeteo(body);
  if (!parsed) return { status: "failed" };
  const saved = await writeCache(supabase, {
    key: "weather",
    etag: null,
    attempted_at: now.toISOString(),
    fetched_at: now.toISOString(),
    payload: { tempC: parsed.tempC, label: parsed.label, code: parsed.code, hours: parseForecast(body) },
    ok: true,
  });
  return { status: saved ? "updated" : "failed" };
}

export async function readWeather(supabase: Client, location: string): Promise<{
  location: string;
  tempC: number | null;
  label: string | null;
  fetchedAt: string | null;
  hours: ForecastHour[];
}> {
  const row = await readCache(supabase, "weather");
  if (!row || row === "unavailable" || !row.ok || !row.fetched_at) {
    return { location, tempC: null, label: null, fetchedAt: null, hours: [] };
  }
  const payload = weatherPayload(row.payload);
  if (!payload) return { location, tempC: null, label: null, fetchedAt: null, hours: [] };
  return { location, tempC: payload.tempC, label: payload.label, fetchedAt: row.fetched_at, hours: payload.hours };
}

export async function readTikTokTitle(supabase: Client): Promise<string | null> {
  const row = await readCache(supabase, "tiktok");
  if (!row || row === "unavailable" || !row.ok) return null;
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  const title = row.payload.videoTitle;
  return typeof title === "string" && title.trim() ? title : null;
}

export async function refreshAnalytics(
  now = new Date(),
  supabase = createServiceClient(),
): Promise<{ status: "unconfigured" | "skipped" | "updated" | "failed" | "unavailable" }> {
  if (!analyticsAdapter()) return { status: "unconfigured" };
  const row = await readCache(supabase, "analytics");
  if (row === "unavailable") return { status: "unavailable" };
  if (row && !shouldRefresh(row.attempted_at, now, ANALYTICS_INTERVAL_MS)) return { status: "skipped" };
  if (!(await claim(supabase, "analytics", now))) return { status: "unavailable" };
  const outcome = await fetchAnalytics(process.env, fetch, now);
  if (outcome.status !== "updated") return { status: "failed" };
  const stored = await storeMetrics(supabase, reportToMetrics(outcome.report, now), now, ["site.day.", "site.page.", "site.source."]);
  if (!stored) return { status: "failed" };
  const saved = await writeCache(supabase, {
    key: "analytics",
    etag: null,
    attempted_at: now.toISOString(),
    fetched_at: now.toISOString(),
    payload: { days: outcome.report.days.length },
    ok: true,
  });
  return { status: saved ? "updated" : "failed" };
}

export async function refreshTikTok(
  now = new Date(),
  supabase = createServiceClient(),
): Promise<{ status: "unconfigured" | "skipped" | "updated" | "failed" | "unavailable" }> {
  if (!zernioConfigured()) return { status: "unconfigured" };
  const row = await readCache(supabase, "tiktok");
  if (row === "unavailable") return { status: "unavailable" };
  if (row && !shouldRefresh(row.attempted_at, now, TIKTOK_INTERVAL_MS)) return { status: "skipped" };
  const previousTitle = cacheTitle(row);
  if (!(await claim(supabase, "tiktok", now))) return { status: "unavailable" };
  const outcome = await fetchTikTok(process.env, fetch, now);
  if (outcome.status !== "updated") return { status: "failed" };
  const stored = await storeMetrics(supabase, tiktokToMetrics(outcome.report), now, ["tiktok.views.day."]);
  if (!stored) return { status: "failed" };
  const saved = await writeCache(supabase, {
    key: "tiktok",
    etag: null,
    attempted_at: now.toISOString(),
    fetched_at: now.toISOString(),
    payload: { videoTitle: outcome.report.video?.title ?? previousTitle },
    ok: true,
  });
  return { status: saved ? "updated" : "failed" };
}

export async function readCalendarFetchedAt(supabase: Client): Promise<string | null> {
  const { data, error } = await supabase.from("integration_cache").select("key, fetched_at, ok").like("key", "calendar:%");
  if (error || !data) return null;
  let oldest: string | null = null;
  for (const row of data) {
    if (!row.ok || !row.fetched_at) continue;
    if (!oldest || row.fetched_at < oldest) oldest = row.fetched_at;
  }
  return oldest;
}

async function refreshPerson(supabase: Client, personId: string, now: Date): Promise<PersonRefresh> {
  if (!/^[a-z0-9_-]+$/i.test(personId)) return { id: personId, status: "failed" };
  const url = calendarUrlFromEnv(personId);
  if (!url) return { id: personId, status: "unconfigured" };
  const key = `calendar:${personId}`;
  const row = await readCache(supabase, key);
  if (row === "unavailable") return { id: personId, status: "unavailable" };
  const due = !row || shouldRefresh(row.attempted_at, now, CALENDAR_INTERVAL_MS);
  if (!due) return { id: personId, status: "skipped" };
  if (!(await claim(supabase, key, now))) return { id: personId, status: "unavailable" };

  const fetched = await fetchText(url, row?.etag ?? null);
  const outcome = outcomeFromFeed({ url, due: true, fetched, personId, now });
  if (outcome.status === "not_modified") {
    await writeCache(supabase, {
      key,
      etag: row?.etag ?? null,
      attempted_at: now.toISOString(),
      fetched_at: now.toISOString(),
      payload: row?.payload ?? {},
      ok: true,
    });
    return { id: personId, status: "not_modified" };
  }
  if (!outcome.replace) return { id: personId, status: outcome.status };
  const stored = await storeEvents(supabase, personId, outcome.events, now);
  if (!stored) return { id: personId, status: "failed" };
  await writeCache(supabase, {
    key,
    etag: outcome.etag,
    attempted_at: now.toISOString(),
    fetched_at: now.toISOString(),
    payload: { count: outcome.events.length },
    ok: true,
  });
  return { id: personId, status: "updated" };
}

async function storeEvents(
  supabase: Client,
  personId: string,
  events: { externalId: string; title: string; start: string; end: string; allDay: boolean; personId: string }[],
  now: Date,
): Promise<boolean> {
  const { data: existing, error } = await supabase
    .from("events")
    .select("id, external_id, locked, source")
    .like("external_id", `ical:${personId}:%`);
  if (error) return false;
  const byExternal = new Map((existing ?? []).map((row) => [row.external_id, row]));
  const rows = events
    .filter((event) => {
      const current = byExternal.get(event.externalId);
      return !current || (!current.locked && current.source === "integration");
    })
    .map((event) => ({
      id: byExternal.get(event.externalId)?.id ?? crypto.randomUUID(),
      title: event.title,
      starts_at: event.start,
      ends_at: event.end,
      all_day: event.allDay,
      person_id: event.personId,
      source: "integration" as const,
      locked: false,
      external_id: event.externalId,
      deleted_at: null,
    }));
  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("events").upsert(rows, { onConflict: "external_id" });
    if (upsertError) return false;
  }

  const keep = new Set(events.map((event) => event.externalId));
  const stale = (existing ?? [])
    .filter(
      (row) =>
        row.external_id &&
        !keep.has(row.external_id) &&
        !row.locked &&
        row.source === "integration",
    )
    .map((row) => row.id);
  if (stale.length > 0) {
    const { error: staleError } = await supabase.from("events").update({ deleted_at: now.toISOString() }).in("id", stale);
    if (staleError) return false;
  }

  const { error: seedError } = await supabase
    .from("events")
    .update({ deleted_at: now.toISOString() })
    .eq("person_id", personId)
    .eq("source", "integration")
    .eq("locked", false)
    .is("deleted_at", null)
    .like("external_id", "event-%");
  return !seedError;
}

async function loadPeople(supabase: Client): Promise<{ id: string }[]> {
  const fallback = [{ id: "alex" }, { id: "mara" }];
  const { data, error } = await supabase.from("config").select("people").eq("id", 1).maybeSingle();
  if (error || !data) return fallback;
  const parsed = configSchema.shape.people.safeParse(data.people);
  if (!parsed.success || parsed.data.length === 0) return fallback;
  return parsed.data.map((person) => ({ id: person.id }));
}

async function loadLocation(supabase: Client): Promise<{ name: string; latitude: number; longitude: number }> {
  const { data, error } = await supabase.from("config").select("location").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_LOCATION;
  const parsed = configSchema.shape.location.safeParse(data.location);
  if (!parsed.success) return DEFAULT_LOCATION;
  return { name: parsed.data.name, latitude: parsed.data.latitude, longitude: parsed.data.longitude };
}

async function readCache(supabase: Client, key: string): Promise<CacheRow | null | "unavailable"> {
  const { data, error } = await supabase
    .from("integration_cache")
    .select("key, etag, attempted_at, fetched_at, payload, ok")
    .eq("key", key)
    .maybeSingle();
  if (error) return "unavailable";
  return data;
}

async function claim(supabase: Client, key: string, now: Date): Promise<boolean> {
  const { error } = await supabase.from("integration_cache").upsert(
    { key, attempted_at: now.toISOString() },
    { onConflict: "key" },
  );
  return !error;
}

async function writeCache(supabase: Client, row: CacheRow): Promise<boolean> {
  const { error } = await supabase.from("integration_cache").upsert(row, { onConflict: "key" });
  return !error;
}

function weatherPayload(value: Json): { tempC: number; label: string; hours: ForecastHour[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const temp = value.tempC;
  const label = value.label;
  if (typeof temp !== "number" || !Number.isFinite(temp) || typeof label !== "string") return null;
  return { tempC: temp, label, hours: forecastHours(value.hours) };
}

function cacheTitle(row: CacheRow | null | "unavailable"): string | null {
  if (!row || row === "unavailable" || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  const title = row.payload.videoTitle;
  return typeof title === "string" && title.trim() ? title : null;
}

function forecastHours(value: Json | undefined): ForecastHour[] {
  if (!Array.isArray(value)) return [];
  const hours: ForecastHour[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const time = item.time;
    const code = item.code;
    const precipitationMm = item.precipitationMm;
    if (typeof time !== "string" || typeof code !== "number") continue;
    hours.push({
      time,
      code,
      precipitationMm: typeof precipitationMm === "number" && Number.isFinite(precipitationMm) ? precipitationMm : 0,
    });
  }
  return hours;
}
