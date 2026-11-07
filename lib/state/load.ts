import { readCalendarFetchedAt, readWeather, refreshDueIntegrations } from "@/lib/adapters/run";
import { createServiceClient } from "@/lib/db/server";
import { cardSchema, configSchema } from "@/lib/schemas";
import { sampleConfig } from "@/lib/seed/sample-config";
import { sampleMetrics } from "@/lib/seed/sample-metrics";
import { sampleSnapshot } from "@/lib/state/sample";
import type { Snapshot, SnapshotCard, SnapshotMetric, SnapshotPriority } from "@/lib/state/types";
import { addDays, zonedParts, zonedTimeToUtc } from "@/lib/time/bucharest";

export async function loadSnapshot(now = new Date()): Promise<Snapshot> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return sampleSnapshot(now);
  }
  try {
    await refreshDueIntegrations(now);
  } catch {
    // The last stored events and weather stay on screen.
  }
  return loadDatabaseSnapshot(now);
}

async function loadDatabaseSnapshot(now: Date): Promise<Snapshot> {
  const supabase = createServiceClient();
  const parts = zonedParts(now);
  const windowStart = zonedTimeToUtc({ ...addDays(parts, -45), hour: 0, minute: 0 }).toISOString();
  const windowEnd = zonedTimeToUtc({ ...addDays(parts, 45), hour: 23, minute: 59 }).toISOString();

  const [configResult, eventsResult, tasksResult, shoppingResult, cardsResult, recapsResult, prioritiesResult, metricsResult] =
    await Promise.all([
      supabase.from("config").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("events")
        .select("id, title, starts_at, ends_at, all_day, person_id")
        .is("deleted_at", null)
        .lte("starts_at", windowEnd)
        .gte("ends_at", windowStart)
        .order("starts_at"),
      supabase.from("tasks").select("id, text, done, assignee_id, due_date").is("deleted_at", null),
      supabase.from("shopping_items").select("id, text, qty, unit, category, checked").is("deleted_at", null),
      supabase
        .from("cards")
        .select("id, view_id, kind, title, body, color, tilt, grid_col, grid_row, grid_col_span, grid_row_span, expires_at, pinned, source, locked, external_id, data")
        .eq("view_id", "vision")
        .is("deleted_at", null),
      supabase
        .from("recaps")
        .select("id, text, highlights, expires_at, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("priorities")
        .select("text, reason, expires_at, source, locked, updated_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(10),
      supabase.from("metrics").select("key, value, previous, fetched_at, source").is("deleted_at", null),
    ]);

  if (
    configResult.error ||
    eventsResult.error ||
    tasksResult.error ||
    shoppingResult.error ||
    cardsResult.error ||
    recapsResult.error ||
    prioritiesResult.error ||
    metricsResult.error
  ) {
    throw new Error("Dashboard data is unavailable");
  }

  const parsedConfig = configSchema.safeParse({
    theme: configResult.data?.theme,
    people: configResult.data?.people,
    views: configResult.data?.views,
    profiles: configResult.data?.profiles,
    quietHours: configResult.data?.quiet_hours,
    location: configResult.data?.location,
    rules: configResult.data?.rules,
  });
  const config = parsedConfig.success ? parsedConfig.data : configSchema.parse(sampleConfig);

  const cards: SnapshotCard[] = [];
  for (const row of cardsResult.data ?? []) {
    const parsed = cardSchema.safeParse({
      id: row.id,
      viewId: row.view_id,
      kind: row.kind,
      title: row.title ?? undefined,
      body: row.body ?? undefined,
      color: row.color,
      tilt: Number(row.tilt),
      grid: {
        col: row.grid_col,
        row: row.grid_row,
        colSpan: row.grid_col_span,
        rowSpan: row.grid_row_span,
      },
      expiresAt: row.expires_at ?? undefined,
      pinned: row.pinned,
      source: row.source,
      locked: row.locked,
      externalId: row.external_id ?? undefined,
      data: isRecord(row.data) ? row.data : {},
    });
    if (!parsed.success) continue;
    cards.push({
      id: parsed.data.id,
      kind: parsed.data.kind,
      title: parsed.data.title ?? null,
      body: parsed.data.body ?? null,
      color: parsed.data.color,
      tilt: parsed.data.tilt,
      grid: parsed.data.grid,
      expiresAt: parsed.data.expiresAt ?? null,
      data: parsed.data.data,
    });
  }

  const metrics = mergeSampleMetrics(eventsToMetrics(metricsResult.data ?? []), now);
  const recapRow = (recapsResult.data ?? []).find((row) => !row.expires_at || new Date(row.expires_at).getTime() > now.getTime());
  const weather = await readWeather(supabase, config.location.name).catch(() => ({
    location: config.location.name,
    tempC: null,
    label: null,
    fetchedAt: null,
  }));
  const calendarFetchedAt = await readCalendarFetchedAt(supabase).catch(() => null);

  return {
    config,
    events: (eventsResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      start: row.starts_at,
      end: row.ends_at,
      allDay: row.all_day,
      personId: row.person_id,
    })),
    tasks: (tasksResult.data ?? []).map((row) => ({
      id: row.id,
      text: row.text,
      done: row.done,
      assigneeId: row.assignee_id,
      dueDate: row.due_date,
    })),
    shopping: (shoppingResult.data ?? []).map((row) => ({
      id: row.id,
      text: row.text,
      qty: asNumber(row.qty),
      unit: row.unit,
      category: row.category,
      checked: row.checked,
    })),
    cards,
    recap: recapRow
      ? {
          id: recapRow.id,
          text: recapRow.text,
          highlights: Array.isArray(recapRow.highlights)
            ? recapRow.highlights.filter((item): item is string => typeof item === "string")
            : [],
          expiresAt: recapRow.expires_at,
        }
      : null,
    priorities: (prioritiesResult.data ?? []).map(
      (row): SnapshotPriority => ({
        text: row.text,
        reason: row.reason,
        expiresAt: row.expires_at,
        source: row.source,
        locked: row.locked,
        updatedAt: row.updated_at,
      }),
    ),
    metrics,
    weather,
    calendarFetchedAt,
  };
}

function eventsToMetrics(
  rows: { key: string; value: number; previous: number | null; fetched_at: string; source: SnapshotMetric["source"] }[],
): SnapshotMetric[] {
  return rows.map((row) => ({
    key: row.key,
    value: asNumber(row.value),
    previous: row.previous === null ? null : asNumber(row.previous),
    fetchedAt: row.fetched_at,
    source: row.source,
  }));
}

function mergeSampleMetrics(metrics: SnapshotMetric[], now: Date): SnapshotMetric[] {
  const sample = sampleMetrics(now).map(({ key, value, previous, fetchedAt, source }) => ({
    key,
    value,
    previous,
    fetchedAt,
    source,
  }));
  const hasSite = metrics.some((metric) => metric.key.startsWith("site."));
  const hasTikTok = metrics.some((metric) => metric.key.startsWith("tiktok."));
  return [
    ...metrics,
    ...(hasSite ? [] : sample.filter((metric) => metric.key.startsWith("site."))),
    ...(hasTikTok ? [] : sample.filter((metric) => metric.key.startsWith("tiktok."))),
  ];
}

function asNumber(value: number | string): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
