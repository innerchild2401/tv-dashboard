import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { imageKind, PHOTO_MAX_BYTES, type ImageKind } from "@/lib/photos/sniff";

export type ImageFetch = (
  url: string,
) => Promise<{ ok: true; bytes: Uint8Array; type: ImageKind } | { ok: false; reason: string }>;

type Net = {
  lookup?: (hostname: string) => Promise<string[]>;
  fetch?: typeof fetch;
};

const BLOCKED_HOST = /(^|\.)localhost$|\.local$|\.internal$|^0\.0\.0\.0$|^metadata\.google\.internal$/i;

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/\.+$/, "").toLowerCase();
  if (!host || BLOCKED_HOST.test(host)) return true;
  if (/^\d+(\.\d+){0,3}$/.test(host)) return true;
  if (isIP(host) && isBlockedAddress(host)) return true;
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  const version = isIP(mapped);
  if (version === 4) return blockedV4(mapped.split(".").map(Number));
  if (version === 6) return blockedV6(address);
  return true;
}

export async function readPublicImage(url: string, net: Net = {}): Promise<Awaited<ReturnType<ImageFetch>>> {
  const fetchImpl = net.fetch ?? fetch;
  const resolve = net.lookup ?? defaultLookup;
  return readHop(url, fetchImpl, resolve, 0);
}

async function readHop(
  url: string,
  fetchImpl: typeof fetch,
  resolve: (hostname: string) => Promise<string[]>,
  hops: number,
): Promise<Awaited<ReturnType<ImageFetch>>> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "image address must be a public http(s) URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "image address must be a public http(s) URL" };
  }
  if (parsed.username || parsed.password || isBlockedHostname(parsed.hostname)) {
    return { ok: false, reason: "image address must be a public http(s) URL" };
  }
  let addresses: string[];
  try {
    addresses = isIP(parsed.hostname) ? [parsed.hostname] : await resolve(parsed.hostname);
  } catch {
    return { ok: false, reason: "that image address could not be resolved" };
  }
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    return { ok: false, reason: "image address must be a public http(s) URL" };
  }
  let response: Response;
  try {
    response = await fetchImpl(parsed.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" },
    });
  } catch {
    return { ok: false, reason: "the image could not be fetched" };
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location || hops >= 2) return { ok: false, reason: "the image could not be fetched" };
    return readHop(new URL(location, parsed).toString(), fetchImpl, resolve, hops + 1);
  }
  if (!response.ok) return { ok: false, reason: "the image could not be fetched" };
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > PHOTO_MAX_BYTES) return { ok: false, reason: "image is larger than 5 MB" };
  const bytes = await readLimited(response);
  if (!bytes) return { ok: false, reason: "image is larger than 5 MB" };
  const type = imageKind(bytes);
  if (!type) return { ok: false, reason: "image type is not a photo" };
  return { ok: true, bytes, type };
}

async function readLimited(response: Response): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > PHOTO_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(step.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function blockedV4(parts: number[]): boolean {
  if (parts.length !== 4 || parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function blockedV6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("::ffff:")) return isBlockedAddress(value.slice(7));
  return false;
}
