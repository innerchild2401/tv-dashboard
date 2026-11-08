import { ro } from "@/i18n/ro";
import { requireRemote } from "@/lib/auth/remote";
import { parseDestination } from "@/lib/remote/capture";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { captureItem } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  if (!body || typeof body !== "object") return fail(400, ro.remote.invalid);
  const record = body as { text?: unknown; destination?: unknown };
  const destination = parseDestination(record.destination);
  if (!destination || typeof record.text !== "string") return fail(400, ro.remote.invalid);
  const saved = await captureItem(record.text, destination, new Date());
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, id: saved.item.id, notified });
}
