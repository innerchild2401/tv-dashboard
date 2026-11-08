import { createServiceClient, databaseConfigured } from "@/lib/db/server";
import { extensionFor, imageKind, kindFromType, PHOTO_MAX_BYTES, type ImageKind } from "@/lib/photos/sniff";
import { memoryPhoto } from "@/lib/remote/memory";

const BUCKET = "photos";

export function isPhotoPath(path: string): boolean {
  return /^(phone|memory|agent)\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(path);
}

export async function signPhotoMap(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path) => path.startsWith("phone/") || path.startsWith("agent/")))];
  if (!databaseConfigured() || unique.length === 0) return new Map();
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 60 * 60 * 2);
  if (error || !data) return new Map();
  const map = new Map<string, string>();
  for (let index = 0; index < data.length; index += 1) {
    const item = data[index];
    const signed = item?.signedUrl;
    if (!signed) continue;
    if (item.path) map.set(item.path, signed);
    const requested = unique[index];
    if (requested) map.set(requested, signed);
  }
  return map;
}

export async function createUploadTicket(
  contentType: string,
  bytes: number,
): Promise<{ ok: true; path: string; signedUrl: string } | { ok: false; reason: "type" | "size" | "unavailable" }> {
  const kind = kindFromType(contentType);
  if (!kind) return { ok: false, reason: "type" };
  if (!Number.isFinite(bytes) || bytes < 1 || bytes > PHOTO_MAX_BYTES) return { ok: false, reason: "size" };
  if (!databaseConfigured()) return { ok: false, reason: "unavailable" };
  const path = `phone/${crypto.randomUUID()}.${extensionFor(kind)}`;
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, reason: "unavailable" };
  return { ok: true, path, signedUrl: data.signedUrl };
}

export async function storePhoto(
  bytes: Uint8Array,
  save: (path: string, bytes: Uint8Array, type: ImageKind) => Promise<boolean>,
): Promise<{ ok: true; path: string; type: ImageKind } | { ok: false; reason: "type" | "size" }> {
  if (bytes.length < 1 || bytes.length > PHOTO_MAX_BYTES) return { ok: false, reason: "size" };
  const kind = imageKind(bytes);
  if (!kind) return { ok: false, reason: "type" };
  const path = `${databaseConfigured() ? "phone" : "memory"}/${crypto.randomUUID()}.${extensionFor(kind)}`;
  const saved = await save(path, bytes, kind);
  if (!saved) return { ok: false, reason: "type" };
  return { ok: true, path, type: kind };
}

export async function verifyStoredPhoto(path: string): Promise<boolean> {
  if (!isPhotoPath(path)) return false;
  if (path.startsWith("memory/")) {
    const photo = memoryPhoto(path);
    return Boolean(photo && imageKind(photo.bytes) === photo.type);
  }
  if (!databaseConfigured()) return false;
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return false;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const kind = imageKind(bytes);
  const expected = path.split(".").pop();
  if (!kind || extensionFor(kind) !== expected) {
    await supabase.storage.from(BUCKET).remove([path]);
    return false;
  }
  return true;
}

export async function uploadPhotoObject(path: string, bytes: Uint8Array, type: ImageKind): Promise<boolean> {
  if (!databaseConfigured()) return false;
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(bytes), {
    contentType: type,
    upsert: false,
  });
  return !error;
}
