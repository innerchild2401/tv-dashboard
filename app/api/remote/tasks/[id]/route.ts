import { ro } from "@/i18n/ro";
import { requireRemote } from "@/lib/auth/remote";
import { cleanTask, taskBody } from "@/lib/remote/lists";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { listTasks, patchTask, peopleIds, removeTask } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const current = (await listTasks()).find((task) => task.id === id);
  if (!current) return fail(404, ro.remote.missing);
  const cleaned = cleanTask(taskBody(await readJson(request)), await peopleIds(), current.value);
  if (!cleaned.ok) return fail(400, cleaned.reason);
  const saved = await patchTask(id, cleaned.value);
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const saved = await removeTask(id, new Date());
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}
