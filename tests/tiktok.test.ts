import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fetchTikTok, parseZernio, tiktokToMetrics, zernioConfigured } from "../lib/adapters/tiktok";

const fixture = JSON.parse(readFileSync(new URL("fixtures/tiktok/zernio.json", import.meta.url), "utf8")) as {
  posts: unknown;
  followers: unknown;
  insights: unknown;
};

describe("TikTok adapter", () => {
  const now = new Date("2026-11-07T10:00:00.000Z");

  it("reads a Zernio fixture into followers, daily views and the last video", () => {
    const report = parseZernio(fixture, now);
    assert.equal(report?.followers, 12840);
    assert.equal(report?.followersPrevious, 12710);
    assert.equal(report?.video?.title, "Dimineața la mal");
    assert.equal(report?.video?.views, 8200);
    assert.equal(report?.likes7d, 720);
    const rows = tiktokToMetrics(report ?? { followers: null, followersPrevious: null, days: [], likes7d: null, likesPrevious: null, video: null });
    assert.equal(rows.some((row) => row.key === "tiktok.followers" && row.value === 12840), true);
    assert.equal(rows.some((row) => row.key === "tiktok.video.likes" && row.value === 640), true);
    assert.equal(parseZernio({}, now), null);
    assert.equal(parseZernio({ posts: { posts: [] }, followers: { accounts: [] } }, now), null);
  });

  it("does not call Zernio when the key is missing and does not throw when the call fails", async () => {
    assert.equal(zernioConfigured({}), false);
    let called = false;
    const idle = await fetchTikTok({}, async () => {
      called = true;
      throw new Error("should not run");
    }, now);
    assert.equal(idle.status, "unconfigured");
    assert.equal(called, false);

    const failed = await fetchTikTok({ ZERNIO_API_KEY: "present" }, async () => {
      throw new Error("down");
    }, now);
    assert.equal(failed.status, "failed");
    assert.equal(JSON.stringify(failed).includes("present"), false);
  });
});
