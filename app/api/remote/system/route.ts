import { requireRemote } from "@/lib/auth/remote";
import { queueCommand } from "@/lib/pi/store";
import { loadSystem } from "@/lib/pi/system";
import { parseCommand } from "@/lib/pi/watch";
import { fail, json, readJson } from "@/lib/remote/http";
import { ro } from "@/i18n/ro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const view = await loadSystem();
  if (!view.ok) return fail(503, view.reason);
  return json(view);
}

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const command = parseCommand(await readJson(request));
  if (!command) return fail(400, ro.remote.invalid);
  const saved = await queueCommand(command.kind, command.minutes);
  if (!saved.ok) return fail(503, saved.reason);
  return json({ ok: true });
}
