import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_PLAY_RETRY_MS, LIVE_PLAY_START_MS, probeHlsUrl, tryUnmute } from "../lib/live/playback";

describe("live playback helpers", () => {
  it("keeps Cast-safe timing constants", () => {
    assert.ok(LIVE_PLAY_START_MS >= 8_000);
    assert.ok(LIVE_PLAY_RETRY_MS.length >= 3);
  });

  it("marks unreachable HLS as failed", async () => {
    const probe = await probeHlsUrl("https://example.test/missing.m3u8", async () => {
      throw new Error("offline");
    });
    assert.equal(probe.ok, false);
    assert.equal(probe.looksLikeHls, false);
  });

  it("falls back to GET body when HEAD is refused", async () => {
    let calls = 0;
    const probe = await probeHlsUrl("https://example.test/live.m3u8", async (_url, init) => {
      calls += 1;
      if (init?.method === "HEAD") return new Response(null, { status: 403 });
      return new Response("#EXTM3U\n", {
        status: 200,
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      });
    });
    assert.equal(calls, 2);
    assert.equal(probe.ok, true);
    assert.equal(probe.looksLikeHls, true);
  });

  it("remutes when unmute pauses the element", () => {
    const state = { paused: false, muted: true, currentTime: 1.5 };
    const video = {
      get paused() {
        return state.paused;
      },
      get currentTime() {
        return state.currentTime;
      },
      get muted() {
        return state.muted;
      },
      set muted(value: boolean) {
        state.muted = value;
        if (!value) state.paused = true;
      },
      play: async () => {
        state.paused = false;
      },
    } as unknown as HTMLVideoElement;

    assert.equal(tryUnmute(video), false);
    assert.equal(video.muted, true);
  });
});
