import { ro } from "@/i18n/ro";
import { fail } from "@/lib/remote/http";
import { readCookie, SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export function remoteSecret(): string {
  return process.env.SESSION_SECRET ?? "";
}

export function requireRemote(request: Request): { ok: true } | { ok: false; response: Response } {
  const secret = remoteSecret();
  if (!secret) return { ok: false, response: fail(503, ro.remote.notConfigured) };
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token || !verifySession(token, secret)) return { ok: false, response: fail(401, ro.remote.signedOut) };
  return { ok: true };
}
