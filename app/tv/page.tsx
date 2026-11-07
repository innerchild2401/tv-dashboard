import { TodayScreen } from "@/components/views/today-screen";
import { ro } from "@/i18n/ro";
import { authorizeTv } from "@/lib/auth/tv";
import { projectToday } from "@/lib/today/project";
import { sampleSchedule } from "@/lib/today/schedule";
import "./tv.css";

export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = readToken(params.token);
  const auth = authorizeTv(token);
  if (!auth.ok) {
    const message = auth.status === 503 ? ro.tokenUnconfigured : ro.tokenInvalid;
    return (
      <main className="tv-frame">
        <p className="tv-denied">{message}</p>
      </main>
    );
  }

  return <TodayScreen initial={projectToday(sampleSchedule, new Date())} />;
}

function readToken(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}
