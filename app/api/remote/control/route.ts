import { ro, type ViewId } from "@/i18n/ro";
import { requireRemote } from "@/lib/auth/remote";
import { isViewId } from "@/lib/remote/config";
import { applyControl, type ControlAction } from "@/lib/remote/hold";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { readControl, writeControl } from "@/lib/remote/store";
import { buildTvState } from "@/lib/state/build";
import { loadSnapshot } from "@/lib/state/load";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const action = parseAction(await readJson(request));
  if (!action) return fail(400, ro.remote.invalid);
  const now = new Date();
  try {
    const control = await readControl();
    const snapshot = await loadSnapshot(now);
    const tv = buildTvState(snapshot, now, null, control);
    const next = applyControl(control, action, {
      now,
      currentView: tv.currentView,
      views: snapshot.config.views.map((view) => ({
        id: view.id as ViewId,
        enabled: view.enabled,
        order: view.order,
        dwellSeconds: view.dwellSeconds,
      })),
    });
    if (!next.ok) return fail(400, ro.remote.invalid);
    const saved = await writeControl(next.control);
    if (!saved.ok) return fail(503, saved.reason);
    const notified = await publishChange();
    return json({ ok: true, notified });
  } catch {
    return fail(503, ro.remote.unavailable);
  }
}

function parseAction(body: unknown): ControlAction | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { type?: unknown; viewId?: unknown; minutes?: unknown };
  const viewId = typeof record.viewId === "string" && isViewId(record.viewId) ? record.viewId : undefined;
  if (record.type === "pin") {
    const minutes = typeof record.minutes === "number" ? record.minutes : Number(record.minutes);
    return { type: "pin", viewId, minutes: Number.isFinite(minutes) ? minutes : undefined };
  }
  if (record.type === "lock") return { type: "lock", viewId };
  if (
    record.type === "next" ||
    record.type === "previous" ||
    record.type === "pause" ||
    record.type === "resume" ||
    record.type === "unlock" ||
    record.type === "dim" ||
    record.type === "undim"
  ) {
    return { type: record.type };
  }
  return null;
}
