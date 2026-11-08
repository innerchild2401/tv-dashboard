import { ro } from "@/i18n/ro";
import { requireRemote } from "@/lib/auth/remote";
import { asEditable, parseManualCard } from "@/lib/remote/cards";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { deleteCard, updateCard } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, ro.remote.invalid);
  const body = await readJson(request);
  const unlock = Boolean(body && typeof body === "object" && (body as { unlock?: unknown }).unlock === true);
  const parsed = parseManualCard(body, id, unlock);
  if (!parsed) return fail(400, ro.remote.invalid);
  const saved = await updateCard(asEditable(parsed));
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const saved = await deleteCard(id, new Date());
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}
