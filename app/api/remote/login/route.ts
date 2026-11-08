import { attemptsLeft, ro } from "@/i18n/ro";
import { decidePin, pinShapeOk } from "@/lib/auth/pin";
import { tokensMatch } from "@/lib/auth/tv";
import {
  cookieHeader,
  decodeShare,
  readCookie,
  requestIsSecure,
  SESSION_COOKIE,
  SESSION_MS,
  SHARE_COOKIE,
  signSession,
} from "@/lib/auth/session";
import { remoteSecret } from "@/lib/auth/remote";
import { databaseConfigured } from "@/lib/db/server";
import { parseDestination } from "@/lib/remote/capture";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { plainText } from "@/lib/remote/text";
import { captureItem, readGuard, writeGuard } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.REMOTE_PIN ?? "";
  const secret = remoteSecret();
  if (!expected || !secret) return fail(503, ro.remote.notConfigured);
  if (process.env.NODE_ENV === "production" && !databaseConfigured()) return fail(503, ro.remote.notConfigured);

  const body = await readJson(request);
  const pin = body && typeof body === "object" && typeof (body as { pin?: unknown }).pin === "string" ? (body as { pin: string }).pin : "";
  let guard;
  try {
    guard = await readGuard();
  } catch {
    return fail(503, ro.remote.unavailable);
  }
  const decision = decidePin(guard, pin, pinShapeOk(pin) && tokensMatch(pin, expected), new Date());
  try {
    await writeGuard(decision.guard);
  } catch {
    return fail(503, ro.remote.unavailable);
  }
  if (!decision.ok) {
    const reason =
      decision.reason === "locked"
        ? ro.remote.lockedOut
        : decision.reason === "format"
          ? ro.remote.pinFormat
          : `${ro.remote.wrongPin} ${attemptsLeft(decision.remaining)}`;
    return fail(decision.status, reason);
  }

  const secure = requestIsSecure(request);
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, signSession(secret), Math.floor(SESSION_MS / 1000), secure));
  const shared = readCookie(request.headers.get("cookie"), SHARE_COOKIE);
  if (shared) {
    const text = plainText(decodeShare(shared));
    const destination = parseDestination("auto");
    if (text && destination) {
      const saved = await captureItem(text, destination, new Date());
      if (saved.ok) await publishChange();
    }
    response.headers.append("Set-Cookie", cookieHeader(SHARE_COOKIE, "", 0, secure));
  }
  return response;
}
