import type { MetricDraft } from "@/lib/adapters/analytics";
import { createServiceClient } from "@/lib/db/server";

type Client = ReturnType<typeof createServiceClient>;

type Existing = {
  id: string;
  key: string;
  source: "manual" | "assistant" | "integration";
  external_id: string | null;
  deleted_at: string | null;
};

export async function storeMetrics(
  supabase: Client,
  rows: MetricDraft[],
  now: Date,
  prunePrefixes: string[],
): Promise<boolean> {
  const { data, error } = await supabase.from("metrics").select("id, key, source, external_id, deleted_at");
  if (error || !data) return false;
  const existing = data as Existing[];
  const written = new Set<string>();
  const upserts: {
    id: string;
    key: string;
    value: number;
    previous: number | null;
    fetched_at: string;
    source: "integration";
    external_id: string;
    deleted_at: null;
  }[] = [];

  for (const row of rows) {
    const matches = existing.filter((item) => item.key === row.key);
    const active = matches.find((item) => !item.deleted_at);
    if (active?.source === "assistant") continue;
    const current = active ?? matches[0];
    const externalId = current?.external_id ?? `integration:${row.key}`;
    written.add(row.key);
    upserts.push({
      id: current?.id ?? crypto.randomUUID(),
      key: row.key,
      value: row.value,
      previous: row.previous,
      fetched_at: now.toISOString(),
      source: "integration",
      external_id: externalId,
      deleted_at: null,
    });
  }

  if (upserts.length > 0) {
    const { error: writeError } = await supabase.from("metrics").upsert(upserts, { onConflict: "id" });
    if (writeError) return false;
  }

  const stale = existing
    .filter(
      (item) =>
        !item.deleted_at &&
        item.source !== "assistant" &&
        !written.has(item.key) &&
        prunePrefixes.some((prefix) => item.key.startsWith(prefix)),
    )
    .map((item) => item.id);
  if (stale.length === 0) return true;
  const { error: pruneError } = await supabase.from("metrics").update({ deleted_at: now.toISOString() }).in("id", stale);
  return !pruneError;
}
