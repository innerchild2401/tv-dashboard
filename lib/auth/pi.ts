import { tokensMatch } from "@/lib/auth/tv";

export type PiAuth = { ok: true } | { ok: false; status: 401 | 503; reason: string };

export function authorizePi(provided: string): PiAuth {
  const expected = process.env.PI_TOKEN ?? "";
  if (!expected) return { ok: false, status: 503, reason: "pi access is not configured" };
  if (!provided || !tokensMatch(provided, expected)) {
    return { ok: false, status: 401, reason: "pi token is invalid" };
  }
  return { ok: true };
}
