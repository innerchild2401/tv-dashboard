import { ro } from "@/i18n/ro";
import { requireRemote } from "@/lib/auth/remote";
import { cleanPriority } from "@/lib/remote/lists";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { clearLivePriority, setManualPriority } from "@/lib/remote/store";
import { endOfZonedDay, zonedParts } from "@/lib/time/bucharest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  if (!body || typeof body !== "object") return fail(400, ro.remote.invalid);
  const record = body as { text?: unknown; reason?: unknown; dueAt?: unknown; expiresAt?: unknown };
  const now = new Date();
  const expiresAt = typeof record.expiresAt === "string" && record.expiresAt ? record.expiresAt : endOfZonedDay(zonedParts(now)).toISOString();
  const dueAt = typeof record.dueAt === "string" && record.dueAt ? record.dueAt : null;
  const cleaned = cleanPriority({
    text: typeof record.text === "string" ? record.text : "",
    reason: typeof record.reason === "string" ? record.reason : "",
    dueAt,
    expiresAt,
  });
  if (!cleaned.ok) return fail(400, cleaned.reason);
  const saved = await setManualPriority(cleaned.value, now);
  if (!saved.ok) return fail(400, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}

export async function DELETE(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const saved = await clearLivePriority(new Date());
  if (!saved.ok) return fail(503, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}
