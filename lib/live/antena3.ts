/** Antena 3 CNN live — on demand only. Thin re-exports for older imports. */

import { LIVE_CHANNELS } from "@/lib/live/channels";

export const ANTENA3_PAGE_URL = LIVE_CHANNELS.antena3.pageUrl;

/**
 * Public free HLS master (no VAST/IMA wrapper). Official antena3.ro/live embeds
 * videojs-ima pre-roll — Cast cannot click through ads, so we never iframe that page.
 */
export const ANTENA3_STREAM_URL = LIVE_CHANNELS.antena3.streamUrl;

export const ANTENA3_LIVE = {
  provider: "antena3" as const,
  pageUrl: ANTENA3_PAGE_URL,
  streamUrl: ANTENA3_STREAM_URL,
};
