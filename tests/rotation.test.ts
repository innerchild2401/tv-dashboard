import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ViewId } from "../i18n/ro";
import { prepareCandidates, resolveRotation, weightedPick, slotSeed, type RotationCandidate } from "../lib/rotation/engine";
import { sourceIsStale } from "../lib/state/availability";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import { nextTvState } from "../lib/tv/session";
import { shouldNightlyReload } from "../lib/tv/reload";
import { zonedTimeToUtc } from "../lib/time/bucharest";

function candidate(id: ViewId, weight: number, dwellSeconds = 45, empty = false, stale = false): RotationCandidate {
  return { id, weight, dwellSeconds, empty, stale };
}

describe("rotation", () => {
  const pool = [
    candidate("today", 3),
    candidate("week", 2),
    candidate("month", 1),
    candidate("site", 1),
    candidate("tiktok", 1),
    candidate("vision", 1),
    candidate("home", 1),
  ];

  it("picks the same view for the same moment", () => {
    const now = new Date("2026-11-07T08:00:00.000Z");
    const first = resolveRotation(now, pool);
    const second = resolveRotation(now, pool);
    assert.equal(first.viewId, second.viewId);
    assert.equal(first.until, second.until);
    assert.equal(first.dwellSeconds, 45);
    assert.equal(new Date(first.until).getTime() - now.getTime() <= 45_000, true);
  });

  it("does not repeat the previous view when another candidate exists", () => {
    const start = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 0, minute: 0 });
    let cursor = start;
    let previous = "";
    for (let step = 0; step < 40; step += 1) {
      const decision = resolveRotation(new Date(cursor.getTime() + 1000), pool);
      assert.notEqual(decision.viewId, previous);
      previous = decision.viewId;
      cursor = new Date(decision.until);
    }
  });

  it("gives the heavier view more slots across a morning", () => {
    const counts = new Map<string, number>();
    let cursor = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 8, minute: 0 });
    const end = cursor.getTime() + 3 * 60 * 60 * 1000;
    while (cursor.getTime() < end) {
      const decision = resolveRotation(new Date(cursor.getTime() + 500), pool);
      counts.set(decision.viewId, (counts.get(decision.viewId) ?? 0) + 1);
      cursor = new Date(decision.until);
    }
    assert.ok((counts.get("today") ?? 0) > (counts.get("month") ?? 0));
  });

  it("moves an empty Today onto Week and skips an empty Home", () => {
    const prepared = prepareCandidates(
      [
        candidate("today", 3, 45, true),
        candidate("week", 2),
        candidate("home", 1, 45, true),
        candidate("vision", 1),
      ],
      true,
    );
    assert.deepEqual(
      prepared.map((view) => [view.id, view.weight]),
      [
        ["week", 5],
        ["vision", 1],
      ],
    );
  });

  it("keeps a stale view only when it is the only candidate", () => {
    const staleSite = candidate("site", 1, 45, false, true);
    const dropped = prepareCandidates([staleSite, candidate("today", 3)], true);
    assert.deepEqual(dropped.map((view) => view.id), ["today"]);
    const kept = prepareCandidates([staleSite], true);
    assert.deepEqual(kept.map((view) => view.id), ["site"]);
  });

  it("uses the chosen dwell when views disagree", () => {
    const mixed = [candidate("today", 1, 10), candidate("week", 1, 30)];
    const start = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 0, minute: 0 });
    const first = resolveRotation(new Date(start.getTime() + 1000), mixed);
    assert.equal(new Date(first.until).getTime() - start.getTime(), first.dwellSeconds * 1000);
    const second = resolveRotation(new Date(first.until), mixed);
    assert.notEqual(second.viewId, first.viewId);
    assert.equal(new Date(second.until).getTime() - new Date(first.until).getTime(), second.dwellSeconds * 1000);
  });

  it("seeds a slot from the day and the slot number", () => {
    assert.equal(slotSeed("2026-11-07", 1), slotSeed("2026-11-07", 1));
    assert.notEqual(slotSeed("2026-11-07", 1), slotSeed("2026-11-07", 2));
    const pick = weightedPick(pool, slotSeed("2026-11-07", 4), "today");
    assert.notEqual(pick.id, "today");
  });
});

describe("state fallbacks", () => {
  it("leaves the previous screen in place when the next payload is unusable", () => {
    const now = new Date("2026-11-07T08:00:00.000Z");
    const current = buildTvState(sampleSnapshot(now), now, "today");
    assert.equal(nextTvState(current, null), current);
    assert.equal(nextTvState(current, { ok: false }), current);
    const next = buildTvState(sampleSnapshot(now), now, "home");
    assert.equal(nextTvState(current, next).currentView, "home");
  });

  it("reloads once during the 04:00 hour in Bucharest", () => {
    const four = new Date("2026-11-07T02:00:00.000Z");
    assert.equal(shouldNightlyReload(four, null), true);
    assert.equal(shouldNightlyReload(four, "2026-11-07"), false);
    const afternoon = new Date("2026-11-07T12:00:00.000Z");
    assert.equal(shouldNightlyReload(afternoon, null), false);
  });

  it("treats integration metrics older than a day as stale", () => {
    const now = new Date("2026-11-07T12:00:00.000Z");
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    assert.equal(
      sourceIsStale([{ key: "site.visitors.today", value: 1, previous: null, fetchedAt: old, source: "integration" }], "site.", now),
      true,
    );
    assert.equal(
      sourceIsStale([{ key: "site.visitors.today", value: 1, previous: null, fetchedAt: old, source: "manual" }], "site.", now),
      false,
    );
  });
});
