import { isLiveOverlayId } from "@/i18n/ro";
import { authorizeTv } from "@/lib/auth/tv";
import { ROTATE_CONTROL } from "@/lib/remote/hold";
import { publishChange } from "@/lib/remote/publish";
import { readControl, writeControl } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

/**
 * TV-token escape hatch: if an in-page live pin is stuck (black screen / hung player),
 * the Cast client can clear only that overlay and return to rotation.
 * Cast-only channels (CORS-blocked) must not call this — Pi MediaController owns playback.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const auth = authorizeTv(token);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
  }

  try {
    const current = await readControl();
    const active =
      current.mode === "pinned" && isLiveOverlayId(current.viewId);
    if (!active) {
      return Response.json(
        { ok: true, cleared: false, reason: "live TV was not pinned" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const next = { ...ROTATE_CONTROL, dimmed: current.dimmed };
    const saved = await writeControl(next);
    if (!saved.ok) {
      return Response.json({ ok: false, reason: saved.reason }, { status: 503 });
    }
    await publishChange().catch(() => false);
    return Response.json(
      { ok: true, cleared: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, reason: "the dashboard could not save that" }, { status: 503 });
  }
}
