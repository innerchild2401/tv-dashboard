import { headers } from "next/headers";
import { TvScreen } from "@/components/tv/screen";
import { ro } from "@/i18n/ro";
import { authorizeTv } from "@/lib/auth/tv";
import { realtimeClientConfig } from "@/lib/realtime/channel";
import { readControl } from "@/lib/remote/store";
import { buildTvState } from "@/lib/state/build";
import { loadSnapshot } from "@/lib/state/load";
import { sampleSnapshot } from "@/lib/state/sample";
import { parseViewId } from "@/lib/tv/session";
import "./tv.css";

export const dynamic = "force-dynamic";

/** Preload Cast-critical faces so Space Grotesk / Fredoka / Caveat are ready before paint. */
const TV_FONT_PRELOADS = [
  "/fonts/space-grotesk-latin-500-normal.woff2",
  "/fonts/space-grotesk-latin-700-normal.woff2",
  "/fonts/space-grotesk-latin-ext-500-normal.woff2",
  "/fonts/space-grotesk-latin-ext-700-normal.woff2",
  "/fonts/fredoka-latin-600-normal.woff2",
  "/fonts/fredoka-latin-ext-600-normal.woff2",
  "/fonts/caveat-latin-500-normal.woff2",
  "/fonts/caveat-latin-ext-500-normal.woff2",
] as const;

export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; view?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = readParam(params.token);
  const auth = authorizeTv(token);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  if (!auth.ok) {
    const message = auth.status === 503 ? ro.tokenUnconfigured : ro.tokenInvalid;
    return (
      <main className="tv-frame">
        <p className="tv-denied">{message}</p>
      </main>
    );
  }

  const now = new Date();
  // Honor ?view= in production too: classic Cast falls back to SSR navigation with the next view.
  const preview = parseViewId(readParam(params.view));
  let snapshot;
  try {
    snapshot = await loadSnapshot(now);
  } catch {
    snapshot = sampleSnapshot(now);
  }
  const control = await readControl();

  return (
    <>
      {TV_FONT_PRELOADS.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
      {/* Raw classic script in SSR HTML so DashCast gets a clock even if React never mounts. */}
      <script src="/tv-tick.js" nonce={nonce} />
      <TvScreen initial={buildTvState(snapshot, now, preview, control)} token={token} realtime={realtimeClientConfig()} />
    </>
  );
}

function readParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}
