import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BACKUP_TABLES, BACKUP_VERSION, MAX_ROWS, PAGE_SIZE, type BackupTableName } from "../lib/backup/catalog";
import { applyLocalEnv, contentTypeForPhoto, emptyCounts, parseArgs, projectRefFromUrl, safePhotoPath, type BackupManifest } from "../lib/backup/files";

const bucket = "photos";

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "backup failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(typeof args.get("out") === "string" ? (args.get("out") as string) : "backups/latest");
  const { url, key, ref } = credentials();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const counts = emptyCounts();
  await mkdir(path.join(outDir, "tables"), { recursive: true });
  for (const table of BACKUP_TABLES) {
    const rows = await readTable(supabase, table.name, table.key);
    counts[table.name] = rows.length;
    await writeFile(path.join(outDir, "tables", `${table.name}.json`), `${JSON.stringify(rows)}\n`);
  }
  const photos = await listPhotos(supabase);
  await mkdir(path.join(outDir, "photos"), { recursive: true });
  for (const photo of photos) {
    if (!safePhotoPath(photo) || !contentTypeForPhoto(photo)) throw new Error(`refusing an unsafe photo path`);
    const { data, error } = await supabase.storage.from(bucket).download(photo);
    if (error || !data) throw new Error(`could not download a photo: ${error?.message ?? "empty"}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    const destination = path.join(outDir, "photos", photo);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    sourceProjectRef: ref,
    tables: BACKUP_TABLES.map((table) => table.name),
    counts,
    photos,
  };
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  process.stdout.write(`Wrote ${total} rows and ${photos.length} photos for ${ref} to ${outDir}\n`);
  process.stdout.write("That folder holds household data. Do not commit it.\n");
}

function credentials(): { url: string; key: string; ref: string } {
  applyLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  const ref = projectRefFromUrl(url);
  if (!ref) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a Supabase project URL.");
  return { url, key, ref };
}

async function readTable(supabase: SupabaseClient, name: BackupTableName, key: "id" | "key"): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(name).select("*").order(key, { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (rows.length > MAX_ROWS) throw new Error(`${name} is larger than this backup allows`);
    if (batch.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function listPhotos(supabase: SupabaseClient, prefix = "", depth = 0): Promise<string[]> {
  if (depth > 4) throw new Error("the photos bucket is nested more deeply than this backup allows");
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`photos: ${error.message}`);
    const batch = data ?? [];
    for (const item of batch) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.metadata) {
        paths.push(...(await listPhotos(supabase, relative, depth + 1)));
      } else if (safePhotoPath(relative)) {
        paths.push(relative);
      }
    }
    if (batch.length < 100) return paths;
    offset += batch.length;
  }
}
