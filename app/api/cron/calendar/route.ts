import { refreshCalendars } from "@/lib/adapters/run";

export const dynamic = "force-dynamic";

async function handle(): Promise<Response> {
  try {
    const report = await refreshCalendars(new Date());
    return Response.json({
      ok: true,
      people: report.people.map((person) => ({ id: person.id, status: person.status })),
    });
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
