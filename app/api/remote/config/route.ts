import { requireRemote } from "@/lib/auth/remote";
import { parseConfig } from "@/lib/remote/config";
import { fail, json, readJson } from "@/lib/remote/http";
import { publishChange } from "@/lib/remote/publish";
import { writeConfig } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const parsed = parseConfig(await readJson(request));
  if (!parsed.ok) return fail(400, parsed.reason);
  const saved = await writeConfig(parsed.config);
  if (!saved.ok) return fail(503, saved.reason);
  const notified = await publishChange();
  return json({ ok: true, notified });
}
