/** Shared Antena 3 / Cast playback helpers (no React). */

export const LIVE_PLAY_START_MS = 12_000;
export const LIVE_PLAY_RETRY_MS = [0, 400, 900, 1600, 2800] as const;
export const LIVE_UNMUTE_RETRY_MS = [0, 500, 1200, 2500, 5000] as const;
/** Never block Cast forever waiting for the hls.js chunk. */
export const HLS_IMPORT_TIMEOUT_MS = 2_500;

export type LiveProbe = {
  ok: boolean;
  status: number;
  contentType: string;
  looksLikeHls: boolean;
};

export type LiveEngine = "hlsjs" | "native";

export type CastUaInfo = {
  castLike: boolean;
  crKey: boolean;
  label: string;
  shortUa: string;
};

export type LiveCapabilities = {
  mse: boolean;
  nativeHls: boolean;
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

/** Chromecast / DashCast / CrKey living-room browsers. */
export function detectCastUa(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): CastUaInfo {
  const crKey = /CrKey/i.test(ua);
  const castLike =
    crKey ||
    /Chromecast|DashCast|SmartTV|Web0S|Tizen|Viera|BRAVIA|AppleTV|GoogleTV/i.test(ua);
  let label = "browser";
  if (crKey) label = "CrKey";
  else if (/Chromecast/i.test(ua)) label = "Chromecast";
  else if (/DashCast/i.test(ua)) label = "DashCast";
  else if (castLike) label = "CastTV";
  const compact = ua ? ua.replace(/\s+/g, " ") : "";
  const token = compact.match(/CrKey\/[\w.]+|Chromecast|DashCast|SmartTV|Web0S|Tizen/i)?.[0];
  const shortUa = !compact
    ? "no-ua"
    : compact.length <= 56
      ? compact
      : token
        ? `${compact.slice(0, 36)}…${token}`
        : compact.slice(0, 56);
  return { castLike, crKey, label, shortUa };
}

/** Sync MSE / native HLS probes — never wait on hls.js for these. */
export function detectLiveCapabilities(
  video?: Pick<HTMLVideoElement, "canPlayType"> | null,
): LiveCapabilities {
  const mse =
    typeof MediaSource !== "undefined" &&
    typeof MediaSource.isTypeSupported === "function" &&
    (MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"') ||
      MediaSource.isTypeSupported('video/mp4; codecs="avc1.77.30,mp4a.40.2"'));
  const nativeHls = Boolean(
    video &&
      (video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
        video.canPlayType("application/x-mpegURL") !== ""),
  );
  return { mse, nativeHls };
}

/**
 * Engine pick for Cast:
 * - MSE available → hls.js (CrKey native HLS often lies / stalls at 0:00)
 * - MSE missing → native HLS only (never fall back to visible <video controls>)
 */
export function preferLiveEngine(mseSupported: boolean, _ua: CastUaInfo): LiveEngine {
  return mseSupported ? "hlsjs" : "native";
}

export function streamHost(url: string): string {
  try {
    return new URL(url).host || "no-host";
  } catch {
    return "bad-url";
  }
}

export function prepareVideoElement(video: HTMLVideoElement, muted: boolean): void {
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("autoplay", "");
  video.removeAttribute("controls");
  video.controls = false;
  video.autoplay = true;
  video.volume = 1;
  video.muted = muted;
  video.defaultMuted = muted;
  if (muted) video.setAttribute("muted", "");
  else video.removeAttribute("muted");
}

export async function playWithRetries(
  video: HTMLVideoElement,
  delaysMs: readonly number[] = LIVE_PLAY_RETRY_MS,
  opts?: { preferUnmuted?: boolean },
): Promise<boolean> {
  const preferUnmuted = opts?.preferUnmuted === true;
  // Cast sessions often allow unmuted autoplay; try sound first, then muted bootstrap.
  if (preferUnmuted) {
    prepareVideoElement(video, false);
    for (const wait of delaysMs) {
      if (wait > 0) await sleep(wait);
      try {
        await video.play();
      } catch {
        // Fall through to muted path.
      }
      if (!video.paused && !video.muted) return true;
      if (!video.paused) break;
    }
  }

  prepareVideoElement(video, true);
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
    video.volume = 1;
    video.muted = false;
    video.defaultMuted = false;
    video.removeAttribute("muted");
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

/** Keep trying unmute after playback advances — Cast may allow audio a few seconds in. */
export async function ensureAudible(
  video: HTMLVideoElement,
  delaysMs: readonly number[] = LIVE_UNMUTE_RETRY_MS,
): Promise<boolean> {
  for (const wait of delaysMs) {
    if (wait > 0) await sleep(wait);
    if (video.paused) continue;
    if (tryUnmute(video)) return true;
  }
  return !video.muted && !video.paused;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type HlsModule = {
  default: {
    isSupported: () => boolean;
    Events: { ERROR: string; MANIFEST_PARSED: string };
    new (config?: Record<string, unknown>): {
      destroy: () => void;
      loadSource: (url: string) => void;
      attachMedia: (video: HTMLVideoElement) => void;
      on: (event: string, handler: (...args: never[]) => void) => void;
    };
  };
};

/**
 * Load hls.js with a hard timeout. A hung Cast chunk fetch must not freeze engine=none forever.
 */
export async function loadHlsModule(
  timeoutMs: number = HLS_IMPORT_TIMEOUT_MS,
  importImpl: () => Promise<HlsModule> = () => import("hls.js") as Promise<HlsModule>,
): Promise<HlsModule["default"] | null> {
  try {
    const mod = await Promise.race([
      importImpl(),
      sleep(timeoutMs).then(() => null),
    ]);
    if (!mod || !mod.default) return null;
    return mod.default;
  } catch {
    return null;
  }
}

export function videoErrorLabel(video: HTMLVideoElement): string {
  const err = video.error;
  if (!err) return "";
  const code =
    err.code === 1
      ? "aborted"
      : err.code === 2
        ? "network"
        : err.code === 3
          ? "decode"
          : err.code === 4
            ? "src"
            : `e${err.code}`;
  return code;
}
