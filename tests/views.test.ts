import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mondayIndex } from "../lib/state/availability";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import { projectMonth, projectWeek } from "../lib/views/calendar";
import { broadcastChangedUrl, realtimeChannelName } from "../lib/realtime/channel";

const morning = new Date("2026-11-07T06:00:00.000Z");

describe("calendar views", () => {
  it("keeps today in the third week column and starts the month on Monday", () => {
    const snapshot = sampleSnapshot(morning);
    const week = projectWeek(snapshot, morning);
    assert.equal(week.columns.length, 7);
    assert.equal(week.columns[2]?.isToday, true);
    assert.equal(week.columns[2]?.day, "7");
    assert.equal(week.columns[0]?.events.some((event) => event.title === "Cafea"), true);
    assert.equal(week.columns[1]?.events.some((event) => event.title === "Sport"), true);
    assert.equal(mondayIndex({ year: 2026, month: 11, day: 2 }), 0);
    assert.equal(mondayIndex({ year: 2026, month: 11, day: 1 }), 6);

    const month = projectMonth(snapshot, morning);
    assert.equal(month.cells.length, 42);
    assert.equal(month.weekdays.length, 7);
    assert.match(month.weekdays[0] ?? "", /^lu/i);
    const today = month.cells.find((cell) => cell.isToday);
    assert.equal(today?.day, "7");
    assert.equal(today?.inMonth, true);
    assert.ok(month.cells.some((cell) => !cell.inMonth));
    assert.ok(month.cells.some((cell) => cell.title === "Mic dejun"));
  });

  it("renders every view from the sample snapshot", () => {
    const snapshot = sampleSnapshot(morning);
    for (const viewId of ["today", "week", "month", "site", "tiktok", "vision", "home"] as const) {
      const state = buildTvState(snapshot, morning, viewId);
      assert.equal(state.currentView, viewId);
      assert.equal(state[viewId] === null, false);
      assert.ok(state.chrome.priority);
      assert.equal(state.chrome.pills.length, 7);
    }
    const vision = buildTvState(snapshot, morning, "vision").vision;
    assert.ok((vision?.cards.length ?? 0) >= 6);
    const home = buildTvState(snapshot, morning, "home").home;
    assert.equal(home?.groups.length, 3);
    const site = buildTvState(snapshot, morning, "site").site;
    assert.equal(site?.series.length, 30);
    assert.equal(site?.updatedLabel, null);
  });
});

describe("realtime channel", () => {
  it("derives a stable name that does not contain the secret", () => {
    const secret = "not-a-real-secret";
    const name = realtimeChannelName(secret);
    assert.equal(name, realtimeChannelName(secret));
    assert.equal(name.startsWith("tv_"), true);
    assert.equal(name.includes(secret), false);
    assert.notEqual(name, realtimeChannelName("other-secret"));
    const url = broadcastChangedUrl("https://example.supabase.co/", name);
    assert.equal(url, `https://example.supabase.co/realtime/v1/api/broadcast/${name}/events/changed`);
  });
});
