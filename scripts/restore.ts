import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BACKUP_TABLES, BACKUP_VERSION, DELETE_ORDER, INSERT_ORDER, tableKey } from "../lib/backup/catalog";
import { applyLocalEnv, contentTypeForPhoto, parseArgs, projectRefFromUrl, restoreAllowed, safePhotoPath, type BackupManifest } from "../lib/backup/files";

const bucket = "photos";

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "restore failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.get("yes") !== true) {
    throw new Error("Refusing to restore without --yes. This deletes public rows on the target project.");
  }
  const fromDir = path.resolve(typeof args.get("from") === "string" ? (args.get("from") as string) : "backups/latest");
  const manifest = await readManifest(fromDir);
  const { url, key, ref } = credentials();
  if (!restoreAllowed(manifest.sourceProjectRef, ref, args.get("replace") === true)) {
    throw new Error(
      `Target ${ref} is the project this backup came from. Pass --replace only when you mean to wipe and reload that project.`,
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const name of DELETE_ORDER) {
    const keyColumn = tableKey(name);
    const { error } = await supabase.from(name).delete().not(keyColumn, "is", null);
    if (error) throw new Error(`could not clear ${name}: ${error.message}`);
  }
  for (const name of INSERT_ORDER) {
    const rows = await readRows(fromDir, name);
    for (let index = 0; index < rows.length; index += 200) {
      const slice = rows.slice(index, index + 200);
      const { error } = await supabase.from(name).insert(slice as never);
      if (error) throw new Error(`could not load ${name}: ${error.message}`);
    }
  }
  for (const photo of manifest.photos) {
    if (!safePhotoPath(photo)) throw new Error("the backup lists an unsafe photo path");
    const type = contentTypeForPhoto(photo);
    if (!type) throw new Error("the backup lists a photo this bucket does not accept");
    const bytes = await readFile(path.join(fromDir, "photos", photo));
    const { error } = await supabase.storage.from(bucket).upload(photo, bytes, { contentType: type, upsert: true });
    if (error) throw new Error(`could not upload a photo: ${error.message}`);
  }
  const total = INSERT_ORDER.reduce((sum, name) => sum + manifest.counts[name], 0);
  process.stdout.write(`Restored ${total} rows and ${manifest.photos.length} photos into ${ref}.\n`);
  process.stdout.write("Schema and cron jobs come from the migrations, not from this folder.\n");
}

function credentials(): { url: string; key: string; ref: string } {
  applyLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local to the target project.");
  const ref = projectRefFromUrl(url);
  if (!ref) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a Supabase project URL.");
  return { url, key, ref };
}

async function readManifest(dir: string): Promise<BackupManifest> {
  const parsed: unknown = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  if (!parsed || typeof parsed !== "object") throw new Error("manifest.json is not an object");
  const manifest = parsed as Partial<BackupManifest>;
  if (manifest.version !== BACKUP_VERSION) throw new Error("this backup was written by a different version");
  if (typeof manifest.sourceProjectRef !== "string" || !projectRefFromUrl(`https://${manifest.sourceProjectRef}.supabase.co`)) {
    throw new Error("the backup does not name a source project");
  }
  if (!Array.isArray(manifest.tables) || manifest.tables.join() !== BACKUP_TABLES.map((table) => table.name).join()) {
    throw new Error("the backup does not list the public tables this app uses");
  }
  if (!manifest.counts || typeof manifest.counts !== "object") throw new Error("the backup has no row counts");
  if (!Array.isArray(manifest.photos) || manifest.photos.some((photo) => typeof photo !== "string" || !safePhotoPath(photo))) {
    throw new Error("the backup lists a photo this script will not restore");
  }
  return manifest as BackupManifest;
}

async function readRows(dir: string, name: string): Promise<Record<string, unknown>[]> {
  const parsed: unknown = JSON.parse(await readFile(path.join(dir, "tables", `${name}.json`), "utf8"));
  if (!Array.isArray(parsed) || parsed.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error(`${name}.json is not a list of rows`);
  }
  return parsed as Record<string, unknown>[];
}
