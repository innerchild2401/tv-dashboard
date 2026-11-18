/** Antena 3 CNN live — on demand only. Never add to default rotation. */

export const ANTENA3_PAGE_URL = "https://www.antena3.ro/live/";

/**
 * Public free HLS used by the official web player (may rotate).
 * Prefer soft in-page `<video>` playback on Cast; iframe is the fallback.
 */
export const ANTENA3_STREAM_URL = "https://live3vox.antenaplay.ro/a3free/a3free.m3u8";

export const ANTENA3_LIVE = {
  provider: "antena3" as const,
  pageUrl: ANTENA3_PAGE_URL,
  streamUrl: ANTENA3_STREAM_URL,
};
