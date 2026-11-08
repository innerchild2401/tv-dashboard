import { ro } from "@/i18n/ro";
import { requireRemote } from "@/lib/auth/remote";
import { databaseConfigured } from "@/lib/db/server";
import { createUploadTicket, storePhoto, uploadPhotoObject } from "@/lib/photos/access";
import { fail, json, readJson } from "@/lib/remote/http";
import { rememberPhoto } from "@/lib/remote/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireRemote(request);
  if (!auth.ok) return auth.response;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await readJson(request);
    const record = body && typeof body === "object" ? (body as { contentType?: unknown; bytes?: unknown }) : {};
    const ticket = await createUploadTicket(typeof record.contentType === "string" ? record.contentType : "", Number(record.bytes));
    if (!ticket.ok) return fail(400, ticket.reason === "size" ? ro.remote.tooLong : ro.remote.badPhoto);
    return json({ ok: true, path: ticket.path, signedUrl: ticket.signedUrl });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, ro.remote.badPhoto);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storePhoto(bytes, (path, data, kind) => {
    if (databaseConfigured()) return uploadPhotoObject(path, data, kind);
    return rememberPhoto(path, data, kind);
  });
  if (!stored.ok) return fail(400, stored.reason === "size" ? ro.remote.tooLong : ro.remote.badPhoto);
  return json({ ok: true, path: stored.path });
}
