/** Shared Antena 3 / Cast playback helpers (no React). */

export const LIVE_PLAY_START_MS = 12_000;
export const LIVE_PLAY_RETRY_MS = [0, 400, 900, 1600, 2800] as const;

export type LiveProbe = {
  ok: boolean;
  status: number;
  contentType: string;
  looksLikeHls: boolean;
};

/** HEAD/GET the free HLS master — used by MCP start and unit tests. */
export async function probeHlsUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveProbe> {
  try {
    const head = await fetchImpl(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    const contentType = head.headers.get("content-type") ?? "";
    if (head.ok) {
      const looksLikeHls =
        /mpegurl|m3u8|application\/octet-stream/i.test(contentType) || url.includes(".m3u8");
      return { ok: true, status: head.status, contentType, looksLikeHls };
    }
    const get = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Range: "bytes=0-63" },
    });
    const body = get.ok ? await get.text() : "";
    const getType = get.headers.get("content-type") ?? "";
    return {
      ok: get.ok && (body.includes("#EXTM3U") || /mpegurl|m3u8/i.test(getType)),
      status: get.status,
      contentType: getType,
      looksLikeHls: body.includes("#EXTM3U") || /mpegurl|m3u8/i.test(getType),
    };
  } catch {
    return { ok: false, status: 0, contentType: "", looksLikeHls: false };
  }
}

export async function playWithRetries(
  video: HTMLVideoElement,
  delaysMs: readonly number[] = LIVE_PLAY_RETRY_MS,
): Promise<boolean> {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.autoplay = true;

  for (const wait of delaysMs) {
    if (wait > 0) await sleep(wait);
    try {
      await video.play();
    } catch {
      // Chromium autoplay may reject until the buffer has data — retry.
    }
    if (!video.paused && (video.readyState >= 2 || video.currentTime > 0)) return true;
    if (!video.paused) return true;
  }
  return !video.paused;
}

/** Unmute only if playback keeps going; otherwise stay muted (Cast-safe). */
export function tryUnmute(video: HTMLVideoElement): boolean {
  if (video.paused) return false;
  const was = video.currentTime;
  try {
    video.muted = false;
  } catch {
    return false;
  }
  if (video.paused) {
    video.muted = true;
    void video.play().catch(() => undefined);
    return false;
  }
  // Some Cast builds pause asynchronously after unmute — snap back.
  if (video.currentTime < was && video.paused) {
    video.muted = true;
    void video.play().catch(() => undefined);
    return false;
  }
  return !video.muted;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
