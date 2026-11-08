import { requireRemote } from "@/lib/auth/remote";
import { cleanTask, taskBody } from "@/lib/remote/lists";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { insertTask, peopleIds } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const cleaned = cleanTask(taskBody(await readJson(request)), await peopleIds());
  if (!cleaned.ok) return fail(400, cleaned.reason);
  const saved = await insertTask(cleaned.value);
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, id: saved.id, notified });
}
