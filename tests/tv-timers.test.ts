import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withLiveClock } from "../lib/tv/session";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";

describe("TV live clock", () => {
  it("keeps the SSR clock until live ticks start", () => {
    const now = new Date("2026-11-08T12:54:00.000Z");
    const state = buildTvState(sampleSnapshot(now), now, "today");
    assert.equal(withLiveClock(state, 0, false).chrome.clock, state.chrome.clock);
  });

  it("advances the clock and dwell from wall time once live", () => {
    const now = new Date("2026-11-08T12:54:00.000Z");
    const state = buildTvState(sampleSnapshot(now), now, "today");
    const later = now.getTime() + 65_000;
    const live = withLiveClock(state, later, true);
    assert.equal(live.chrome.clock, "14:55");
    assert.ok(live.dwellRemaining < state.dwellRemaining);
  });
});
