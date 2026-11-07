import { authorizeTv } from "@/lib/auth/tv";
import { projectToday } from "@/lib/today/project";
import { sampleSchedule } from "@/lib/today/schedule";

export function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const auth = authorizeTv(token);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
  }

  return Response.json({
    ok: true,
    currentView: "today",
    until: null,
    reason: "Ecranul de azi, date de exemplu",
    view: projectToday(sampleSchedule, new Date()),
  });
}
