import { ro } from "@/i18n/ro";

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { status, headers });
}

export function fail(status: number, reason: string): Response {
  return json({ ok: false, reason }, status);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function unavailable(): { ok: false; reason: string } {
  return { ok: false, reason: ro.remote.unavailable };
}
