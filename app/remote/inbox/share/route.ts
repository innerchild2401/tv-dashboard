import {
  cookieHeader,
  encodeShare,
  readCookie,
  requestIsSecure,
  SESSION_COOKIE,
  SHARE_COOKIE,
  verifySession,
} from "@/lib/auth/session";
import { remoteSecret } from "@/lib/auth/remote";
import { shareText } from "@/lib/remote/capture";
import { publishChange } from "@/lib/remote/publish";
import { plainText } from "@/lib/remote/text";
import { captureItem } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const clean = plainText(
    shareText(String(form.get("title") ?? ""), String(form.get("text") ?? ""), String(form.get("url") ?? "")),
  ).slice(0, 500);
  const secure = requestIsSecure(request);
  const secret = remoteSecret();
  const session = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (clean && secret && session && verifySession(session, secret)) {
    const saved = await captureItem(clean, "auto", new Date());
    if (saved.ok) await publishChange();
    return redirect(request, "/remote/inbox");
  }
  const cookie = clean ? cookieHeader(SHARE_COOKIE, encodeShare(clean), 600, secure) : undefined;
  return redirect(request, "/remote", cookie);
}

export function GET(request: Request) {
  return redirect(request, "/remote/inbox");
}

function redirect(request: Request, path: string, cookie?: string): Response {
  const headers = new Headers({ Location: new URL(path, request.url).toString() });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}
