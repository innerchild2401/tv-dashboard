import { authorizeTv } from "@/lib/auth/tv";
import { buildTvState } from "@/lib/state/build";
import { loadSnapshot } from "@/lib/state/load";
import { parseViewId } from "@/lib/tv/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const auth = authorizeTv(token);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
  }

  const now = new Date();
  try {
    const snapshot = await loadSnapshot(now);
    const preview = process.env.NODE_ENV === "production" ? null : parseViewId(new URL(request.url).searchParams.get("view"));
    const state = buildTvState(snapshot, now, preview);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
