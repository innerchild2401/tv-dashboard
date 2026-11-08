import { bearerToken } from "@/lib/agent/auth";
import { authorizePi } from "@/lib/auth/pi";
import { pullCommands } from "@/lib/pi/store";
import { json } from "@/lib/remote/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizePi(bearerToken(request));
  if (!auth.ok) return json({ ok: false, commands: [], reason: auth.reason }, auth.status);
  try {
    const commands = await pullCommands();
    return json({ ok: true, commands });
  } catch {
    return json({ ok: false, commands: [], reason: "the dashboard could not save that" }, 503);
  }
}
