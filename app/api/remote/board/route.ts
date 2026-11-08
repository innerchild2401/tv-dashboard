import { requireRemote } from "@/lib/auth/remote";
import { loadRemoteBoard } from "@/lib/remote/board";
import { fail, json } from "@/lib/remote/http";
import { ro } from "@/i18n/ro";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  try {
    const board = await loadRemoteBoard(new Date());
    return json(board);
  } catch {
    return fail(503, ro.remote.unavailable);
  }
}
