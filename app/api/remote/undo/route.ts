import { executeTool } from "@/lib/agent/tools";
import { requireRemote } from "@/lib/auth/remote";
import { fail, json, readJson } from "@/lib/remote/http";
import { ro } from "@/i18n/ro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  const id = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : undefined;
  if (body && typeof body === "object" && "id" in body && body.id != null && !id) return fail(400, ro.remote.invalid);
  const result = await executeTool("undo", id ? { id } : {});
  if (!result.ok) return json({ ok: false, reason: result.reason ?? ro.remote.failed }, result.reason === "the dashboard database is not configured" ? 503 : 200);
  return json({ ok: true, id: result.id });
}
