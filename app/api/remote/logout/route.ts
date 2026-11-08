import { requireRemote } from "@/lib/auth/remote";
import { cookieHeader, requestIsSecure, SESSION_COOKIE } from "@/lib/auth/session";
import { json } from "@/lib/remote/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, "", 0, requestIsSecure(request)));
  return response;
}
