import { expandIcal, type ExpandedEvent } from "@/lib/adapters/ical";

export type FeedFetch =
  | { kind: "not_modified" }
  | { kind: "ok"; body: string; etag: string | null }
  | { kind: "failed" };

export type FeedOutcome =
  | { status: "unconfigured" | "skipped" | "failed" | "not_modified"; replace: false }
  | { status: "updated"; replace: true; events: ExpandedEvent[]; etag: string | null };

export function calendarUrlFromEnv(personId: string, env: Record<string, string | undefined> = process.env): string | null {
  const suffix = personId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!suffix) return null;
  const raw = env[`ICAL_URL_${suffix}`]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function fetchText(
  url: string,
  etag: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedFetch> {
  try {
    const headers: Record<string, string> = {
      accept: "text/calendar, text/plain, */*",
      "user-agent": "tv-dashboard",
    };
    if (etag) headers["if-none-match"] = etag;
    const response = await fetchImpl(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 304) return { kind: "not_modified" };
    if (!response.ok) return { kind: "failed" };
    const body = await response.text();
    if (body.length > 5_000_000) return { kind: "failed" };
    return { kind: "ok", body, etag: response.headers.get("etag") };
  } catch {
    return { kind: "failed" };
  }
}

export function outcomeFromFeed(input: {
  url: string | null;
  due: boolean;
  fetched: FeedFetch | null;
  personId: string;
  now: Date;
}): FeedOutcome {
  if (!input.url) return { status: "unconfigured", replace: false };
  if (!input.due) return { status: "skipped", replace: false };
  if (!input.fetched || input.fetched.kind === "failed") return { status: "failed", replace: false };
  if (input.fetched.kind === "not_modified") return { status: "not_modified", replace: false };
  const parsed = expandIcal(input.fetched.body, { personId: input.personId, now: input.now });
  if (!parsed.ok) return { status: "failed", replace: false };
  return { status: "updated", replace: true, events: parsed.events, etag: input.fetched.etag };
}
