import { readFileSync } from "node:fs";
import { BACKUP_TABLES, type BackupTableName } from "@/lib/backup/catalog";

export type BackupManifest = {
  version: 1;
  createdAt: string;
  sourceProjectRef: string;
  tables: BackupTableName[];
  counts: Record<BackupTableName, number>;
  photos: string[];
};

export function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const ref = host.split(".")[0] ?? "";
    if (!/^[a-z0-9]{10,30}$/.test(ref)) return null;
    return ref;
  } catch {
    return null;
  }
}

export function readLocalEnv(file = ".env.local"): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(file, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw new Error("Could not read .env.local.");
  }
}

export function applyLocalEnv(file = ".env.local"): void {
  for (const [name, value] of Object.entries(readLocalEnv(file))) {
    if (!process.env[name]) process.env[name] = value;
  }
}

export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (/^[A-Z0-9_]+$/.test(key)) values[key] = value;
  }
  return values;
}

export function parseArgs(argv: string[]): Map<string, string | true> {
  const parsed = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(name, true);
      continue;
    }
    parsed.set(name, next);
    index += 1;
  }
  return parsed;
}

export function restoreAllowed(sourceRef: string, targetRef: string, replace: boolean): boolean {
  if (sourceRef !== targetRef) return true;
  return replace;
}

const PHOTO_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function safePhotoPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  const extension = parts[parts.length - 1]?.split(".").pop() ?? "";
  return Object.hasOwn(PHOTO_TYPES, extension);
}

export function contentTypeForPhoto(path: string): string | null {
  if (!safePhotoPath(path)) return null;
  const extension = path.split(".").pop() ?? "";
  return PHOTO_TYPES[extension] ?? null;
}

export function emptyCounts(): Record<BackupTableName, number> {
  return Object.fromEntries(BACKUP_TABLES.map((table) => [table.name, 0])) as Record<BackupTableName, number>;
}
