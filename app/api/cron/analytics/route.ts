import { refreshAnalytics } from "@/lib/adapters/run";

export const dynamic = "force-dynamic";

async function handle(): Promise<Response> {
  try {
    const report = await refreshAnalytics(new Date());
    return Response.json({ ok: true, status: report.status });
  } catch {
    return Response.json({ ok: true, skipped: true });
  }
}

export function GET(): Promise<Response> {
  return handle();
}

export function POST(): Promise<Response> {
  return handle();
}
