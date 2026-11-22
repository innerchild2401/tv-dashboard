/** On-demand live TV channels — never add to default Cast rotation. */

export const LIVE_CHANNEL_IDS = ["antena3", "kanal-d", "digi24", "realitatea-plus"] as const;
export type LiveChannelId = (typeof LIVE_CHANNEL_IDS)[number];

export type LiveChannel = {
  id: LiveChannelId;
  /** Soft-pin / display_control view id (same as id). */
  viewId: LiveChannelId;
  label: string;
  pageUrl: string;
  streamUrl: string;
  /** False when the HLS master blocks browser CORS — Pi MediaController only. */
  inPageOk: boolean;
  hint: string;
};

/**
 * Static official HLS masters (tested 22 Nov 2026 ~20:50 Europe/Bucharest, Romanian DIGI).
 * No token, no special headers; CrKey / Default Media Receiver OK.
 */
export const LIVE_CHANNELS: Record<LiveChannelId, LiveChannel> = {
  antena3: {
    id: "antena3",
    viewId: "antena3",
    label: "Antena 3 Live",
    pageUrl: "https://www.antena3.ro/live/",
    streamUrl: "https://live3vox.antenaplay.ro/a3free/a3free.m3u8",
    inPageOk: true,
    hint: "Pornit la cerere — nu e în rotație",
  },
  "kanal-d": {
    id: "kanal-d",
    viewId: "kanal-d",
    label: "Kanal D Live",
    pageUrl: "https://www.kanald.ro/",
    streamUrl: "https://stream1.kanald.ro/iphone/knd-live.m3u8",
    inPageOk: true,
    hint: "Pornit la cerere — nu e în rotație",
  },
  digi24: {
    id: "digi24",
    viewId: "digi24",
    label: "Digi 24 Live",
    pageUrl: "https://www.digi24.ro/",
    streamUrl: "https://edge-ar.rcs-rds.ro/digi24ar/index.m3u8",
    // CORS only https://www.digi24.ro — in-page hls.js fails; DMR cast OK.
    inPageOk: false,
    hint: "Doar Chromecast nativ (CORS blochează playerul din pagină)",
  },
  "realitatea-plus": {
    id: "realitatea-plus",
    viewId: "realitatea-plus",
    label: "Realitatea Plus Live",
    pageUrl: "https://www.realitatea.net/",
    streamUrl: "https://stream.realitatea.net/realitatea/plus_md/ts:playlist.m3u8",
    // CORS only https://www.realitatea.net — same caveat as Digi 24.
    inPageOk: false,
    hint: "Doar Chromecast nativ (CORS blochează playerul din pagină)",
  },
};

/** Pi tv-agent must be ≥ this to honor per-channel stream URLs on cast_hls. */
export const LIVE_CAST_URL_MIN_VERSION = 9;

export function isLiveChannelId(value: string | null | undefined): value is LiveChannelId {
  return Boolean(value && (LIVE_CHANNEL_IDS as readonly string[]).includes(value));
}

export function liveChannel(id: LiveChannelId): LiveChannel {
  return LIVE_CHANNELS[id];
}

export function liveChannelFromViewId(viewId: string | null | undefined): LiveChannel | null {
  if (!isLiveChannelId(viewId)) return null;
  return LIVE_CHANNELS[viewId];
}

/** Parse Pi heartbeat version ("8", "9", "9.1") for feature gates. */
export function piAgentMajorVersion(version: string | null | undefined): number {
  if (!version) return 0;
  const match = /^(\d+)/.exec(version.trim());
  return match ? Number(match[1]) : 0;
}

export function piSupportsLiveCastUrl(version: string | null | undefined): boolean {
  return piAgentMajorVersion(version) >= LIVE_CAST_URL_MIN_VERSION;
}

/** CSP media/connect hosts for every known live stream origin. */
export function liveMediaCspHosts(): string {
  const hosts = new Set<string>();
  for (const channel of Object.values(LIVE_CHANNELS)) {
    try {
      const url = new URL(channel.streamUrl);
      hosts.add(`${url.protocol}//${url.host}`);
      // Wildcard sibling hosts when the CDN uses subdomains of a known apex.
      const parts = url.hostname.split(".");
      if (parts.length >= 2) {
        hosts.add(`${url.protocol}//*.${parts.slice(-2).join(".")}`);
      }
    } catch {
      // Skip bad URLs — registry is static.
    }
    try {
      const page = new URL(channel.pageUrl);
      hosts.add(`${page.protocol}//${page.host}`);
    } catch {
      // ignore
    }
  }
  return [...hosts].join(" ");
}
