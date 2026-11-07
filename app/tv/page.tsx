import { TvScreen } from "@/components/tv/screen";
import { ro } from "@/i18n/ro";
import { authorizeTv } from "@/lib/auth/tv";
import { realtimeClientConfig } from "@/lib/realtime/channel";
import { buildTvState } from "@/lib/state/build";
import { loadSnapshot, } from "@/lib/state/load";
import { sampleSnapshot } from "@/lib/state/sample";
import { parseViewId } from "@/lib/tv/session";
import "./tv.css";

export const dynamic = "force-dynamic";

export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; view?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = readParam(params.token);
  const auth = authorizeTv(token);
  if (!auth.ok) {
    const message = auth.status === 503 ? ro.tokenUnconfigured : ro.tokenInvalid;
    return (
      <main className="tv-frame">
        <p className="tv-denied">{message}</p>
      </main>
    );
  }

  const now = new Date();
  const preview = process.env.NODE_ENV === "production" ? null : parseViewId(readParam(params.view));
  let snapshot;
  try {
    snapshot = await loadSnapshot(now);
  } catch {
    snapshot = sampleSnapshot(now);
  }

  return <TvScreen initial={buildTvState(snapshot, now, preview)} token={token} realtime={realtimeClientConfig()} />;
}

function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}
