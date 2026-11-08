import { ro } from "@/i18n/ro";
import { requireRemote } from "@/lib/auth/remote";
import { asEditable, parseManualCard } from "@/lib/remote/cards";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { insertCard } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const parsed = parseManualCard(await readJson(request), crypto.randomUUID(), false);
  if (!parsed) return fail(400, ro.remote.invalid);
  const saved = await insertCard(asEditable(parsed));
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, id: parsed.id, notified });
}
