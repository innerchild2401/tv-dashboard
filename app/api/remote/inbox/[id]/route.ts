import { requireRemote } from "@/lib/auth/remote";
import { fail, json } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { removeInbox } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const saved = await removeInbox(id, new Date());
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}
