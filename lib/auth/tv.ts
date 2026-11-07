import { createHash, timingSafeEqual } from "node:crypto";

export type TvAuth =
  | { ok: true; mode: "open" | "enforced" }
  | { ok: false; status: 401 | 503; reason: string };

export function authorizeTv(provided: string): TvAuth {
  const expected = process.env.TV_TOKEN ?? "";
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 503, reason: "TV access is not configured" };
    }
    return { ok: true, mode: "open" };
  }
  if (!provided || !tokensMatch(provided, expected)) {
    return { ok: false, status: 401, reason: "TV token is invalid" };
  }
  return { ok: true, mode: "enforced" };
}

export function tokensMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
