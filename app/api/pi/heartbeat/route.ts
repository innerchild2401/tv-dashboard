import { bearerToken } from "@/lib/agent/auth";
import { authorizePi } from "@/lib/auth/pi";
import { parseHeartbeat } from "@/lib/pi/watch";
import { saveHeartbeat } from "@/lib/pi/store";
import { json } from "@/lib/remote/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizePi(bearerToken(request));
  if (!auth.ok) return json({ ok: false, reason: auth.reason }, auth.status);
  const text = await request.text();
  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return json({ ok: false, reason: "the body must be JSON" }, 400);
    }
  }
  const heartbeat = parseHeartbeat(body);
  if (!heartbeat) return json({ ok: false, reason: "the heartbeat is not valid" }, 400);
  const saved = await saveHeartbeat(heartbeat);
  if (!saved.ok) return json(saved, 503);
  return json({ ok: true });
}
