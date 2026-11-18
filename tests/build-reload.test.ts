import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBuildId } from "../lib/tv/build-id";
import { shouldReloadForBuild } from "../lib/tv/reload";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import { readIncomingBuildId } from "../lib/tv/session";

describe("Cast build soft-reload", () => {
  it("prefers Vercel commit SHA for buildId", () => {
    assert.equal(
      resolveBuildId({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890deadbeef" }),
      "abcdef123456",
    );
    assert.equal(resolveBuildId({ VERCEL_DEPLOYMENT_ID: "dpl_ABCDEFGHIJKLMNOP" }), "dpl_ABCDEFGHIJKL");
    assert.equal(resolveBuildId({ TV_BUILD_ID: "local-test" }), "local-test");
    assert.equal(resolveBuildId({}), "dev-local");
  });

  it("reloads only when buildId actually changes", () => {
    assert.equal(shouldReloadForBuild("aaa", "bbb"), true);
    assert.equal(shouldReloadForBuild("aaa", "aaa"), false);
    assert.equal(shouldReloadForBuild("aaa", null), false);
    assert.equal(shouldReloadForBuild("", "bbb"), false);
  });

  it("embeds buildId in /api/state payload", () => {
    const prev = process.env.TV_BUILD_ID;
    process.env.TV_BUILD_ID = "cast-build-test";
    try {
      const state = buildTvState(sampleSnapshot(new Date("2026-11-18T12:00:00.000Z")), new Date("2026-11-18T12:00:00.000Z"));
      assert.equal(state.buildId, "cast-build-test");
      assert.equal(readIncomingBuildId(state), "cast-build-test");
      assert.equal(readIncomingBuildId({ ok: true }), null);
    } finally {
      if (prev === undefined) delete process.env.TV_BUILD_ID;
      else process.env.TV_BUILD_ID = prev;
    }
  });
});
