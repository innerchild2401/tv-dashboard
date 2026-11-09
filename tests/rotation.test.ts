import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ViewId } from "../i18n/ro";
import { nextInOrder, peekNextView, prepareCandidates, resolveRotation, type RotationCandidate } from "../lib/rotation/engine";
import { availability, sourceIsStale } from "../lib/state/availability";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import { nextTvState, tvPathWithView, tvStatePath } from "../lib/tv/session";
import { shouldNightlyReload } from "../lib/tv/reload";
import { zonedTimeToUtc } from "../lib/time/bucharest";

function candidate(id: ViewId, weight = 1, dwellSeconds = 120, empty = false, stale = false): RotationCandidate {
  return { id, weight, dwellSeconds, empty, stale };
}

describe("rotation", () => {
  const pool = [
    candidate("today"),
    candidate("week"),
    candidate("momente"),
    candidate("vision"),
    candidate("home"),
  ];

  it("picks the same view for the same moment", () => {
    const now = new Date("2026-11-07T08:00:00.000Z");
    const first = resolveRotation(now, pool);
    const second = resolveRotation(now, pool);
    assert.equal(first.viewId, second.viewId);
    assert.equal(first.until, second.until);
    assert.equal(first.dwellSeconds, 120);
    assert.equal(new Date(first.until).getTime() - now.getTime() <= 120_000, true);
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

  it("walks the pool in config order as a round-robin", () => {
    const start = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 0, minute: 0 });
    const seen: string[] = [];
    let cursor = start;
    for (let step = 0; step < pool.length * 2; step += 1) {
      const decision = resolveRotation(new Date(cursor.getTime() + 500), pool);
      seen.push(decision.viewId);
      cursor = new Date(decision.until);
    }
    assert.deepEqual(seen, [
      "today",
      "week",
      "momente",
      "vision",
      "home",
      "today",
      "week",
      "momente",
      "vision",
      "home",
    ]);
  });

  it("skips empty Today and Home without transferring weight", () => {
    const prepared = prepareCandidates(
      [
        candidate("today", 1, 120, true),
        candidate("week"),
        candidate("home", 1, 120, true),
        candidate("vision"),
      ],
      true,
    );
    assert.deepEqual(
      prepared.map((view) => view.id),
      ["week", "vision"],
    );
  });

  it("keeps a stale view only when it is the only candidate", () => {
    const staleHome = candidate("home", 1, 120, false, true);
    const dropped = prepareCandidates([staleHome, candidate("today")], true);
    assert.deepEqual(
      dropped.map((view) => view.id),
      ["today"],
    );
    const kept = prepareCandidates([staleHome], true);
    assert.deepEqual(
      kept.map((view) => view.id),
      ["home"],
    );
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

  it("picks the next view after previous in order", () => {
    assert.equal(nextInOrder(pool, "today").id, "week");
    assert.equal(nextInOrder(pool, "home").id, "today");
    assert.equal(nextInOrder(pool, null).id, "today");
  });

  it("peeks a different view at the dwell boundary", () => {
    const now = zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 12, minute: 0 });
    const decision = resolveRotation(new Date(now.getTime() + 1000), pool);
    const next = peekNextView(pool, decision.viewId, decision.until);
    assert.notEqual(next, decision.viewId);
  });

  it("peeks a successor of the forced view, not a wall-clock re-resolve", () => {
    const now = zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 14, minute: 10 });
    const until = new Date(now.getTime() + 120_000).toISOString();
    for (const previous of ["momente", "vision", "today", "week"] as ViewId[]) {
      const next = peekNextView(pool, previous, until);
      assert.notEqual(next, previous, `peek after ${previous}`);
    }
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

  it("encodes the next view for Cast SSR navigation", () => {
    const now = zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 12, minute: 0 });
    const state = buildTvState(sampleSnapshot(now), now, "today");
    assert.equal(state.currentView, "today");
    assert.ok(state.nextView);
    assert.notEqual(state.nextView, "today");
    assert.equal(tvPathWithView("/tv?token=abc", state.nextView), `/tv?token=abc&view=${state.nextView}`);
    assert.equal(tvStatePath(), "/api/state");
    assert.equal(tvStatePath(state.nextView), `/api/state?view=${state.nextView}`);

    const chained = buildTvState(sampleSnapshot(now), now, state.nextView);
    assert.equal(chained.currentView, state.nextView);
    assert.notEqual(chained.nextView, chained.currentView);
  });

  it("rotates every remaining view fairly in the forced ?view= Cast chain", () => {
    let now = zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 14, minute: 10 });
    let force: ViewId | null = "momente";
    const counts = new Map<string, number>();
    for (let step = 0; step < 25; step += 1) {
      const state = buildTvState(sampleSnapshot(now), now, force);
      assert.notEqual(state.nextView, state.currentView);
      counts.set(state.currentView, (counts.get(state.currentView) ?? 0) + 1);
      force = state.nextView;
      now = new Date(new Date(state.until).getTime() + 50);
    }
    for (const id of ["today", "week", "momente", "vision", "home"] as ViewId[]) {
      assert.ok((counts.get(id) ?? 0) >= 4, `${id} starved: ${JSON.stringify(Object.fromEntries(counts))}`);
    }
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
      sourceIsStale([{ key: "custom.metric", value: 1, previous: null, fetchedAt: old, source: "integration" }], "custom.", now),
      true,
    );
    assert.equal(
      sourceIsStale([{ key: "custom.metric", value: 1, previous: null, fetchedAt: old, source: "manual" }], "custom.", now),
      false,
    );
  });

  it("keeps Today non-empty when only the next-days strip has events", () => {
    const now = zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 14, minute: 0 });
    const snapshot = sampleSnapshot(now);
    snapshot.events = [
      {
        id: "later",
        title: "Mâine",
        start: zonedTimeToUtc({ year: 2026, month: 11, day: 9, hour: 10, minute: 0 }).toISOString(),
        end: zonedTimeToUtc({ year: 2026, month: 11, day: 9, hour: 11, minute: 0 }).toISOString(),
        allDay: false,
        personId: "alex",
      },
    ];
    const flags = availability(snapshot, now);
    assert.equal(flags.today.empty, false);
    assert.equal(flags.week.empty, false);
  });
});
