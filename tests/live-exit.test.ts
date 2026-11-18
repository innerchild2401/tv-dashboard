import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_VIEW_ID } from "../i18n/ro";
import { LIVE_PLAY_START_MS, loadHlsModule } from "../lib/live/playback";
import {
  LIVE_EXIT_POLL_MS,
  isLiveOverlay,
  liveAbandonPath,
  serverLeftLive,
  shouldAbandonStuckLive,
} from "../lib/tv/live-exit";

describe("live exit / stuck recovery", () => {
  it("polls faster than the normal TV poll while live is up", () => {
    assert.ok(LIVE_EXIT_POLL_MS < 5_000);
    assert.ok(LIVE_EXIT_POLL_MS >= 1_000);
    assert.equal(liveAbandonPath(), "/api/tv/live/abandon");
  });

  it("detects when the server left the Antena 3 overlay", () => {
    assert.equal(
      isLiveOverlay({ currentView: LIVE_VIEW_ID, live: { provider: "antena3", pageUrl: "", streamUrl: "", label: "", hint: "" } }),
      true,
    );
    assert.equal(serverLeftLive({ currentView: "today", live: null, hold: "rotate" }), true);
    assert.equal(serverLeftLive({ currentView: LIVE_VIEW_ID, live: null, hold: "pinned" }), false);
  });

  it("abandons after the stream start grace when never playing", () => {
    const startedAtMs = 1_000;
    assert.equal(
      shouldAbandonStuckLive({
        onLive: true,
        playing: false,
        startedAtMs,
        nowMs: startedAtMs + LIVE_PLAY_START_MS - 1,
      }),
      false,
    );
    assert.equal(
      shouldAbandonStuckLive({
        onLive: true,
        playing: false,
        startedAtMs,
        nowMs: startedAtMs + LIVE_PLAY_START_MS,
      }),
      true,
    );
    assert.equal(
      shouldAbandonStuckLive({
        onLive: true,
        playing: true,
        startedAtMs,
        nowMs: startedAtMs + LIVE_PLAY_START_MS + 5_000,
      }),
      false,
    );
  });

  it("times out a hung hls.js import instead of leaving engine=none forever", async () => {
    const Hls = await loadHlsModule(50, async () => {
      await new Promise(() => {
        /* never resolves — simulates Cast chunk hang */
      });
      throw new Error("unreachable");
    });
    assert.equal(Hls, null);
  });
});
