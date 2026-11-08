import { requireRemote } from "@/lib/auth/remote";
import { cleanShopping, shoppingBody } from "@/lib/remote/lists";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { insertShopping } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const cleaned = cleanShopping(shoppingBody(await readJson(request)));
  if (!cleaned.ok) return fail(400, cleaned.reason);
  const saved = await insertShopping(cleaned.value);
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, id: saved.id, notified });
}
