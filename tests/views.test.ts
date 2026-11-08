import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mondayIndex } from "../lib/state/availability";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import { projectMonth, projectWeek } from "../lib/views/calendar";
import { broadcastChangedUrl, realtimeChannelName } from "../lib/realtime/channel";
import { zonedTimeToUtc } from "../lib/time/bucharest";

const morning = new Date("2026-11-07T06:00:00.000Z");

describe("calendar views", () => {
  it("keeps today in the third week column and starts the month on Monday", () => {
    const snapshot = sampleSnapshot(morning);
    const week = projectWeek(snapshot, morning);
    assert.equal(week.columns.length, 7);
    assert.equal(week.columns[2]?.isToday, true);
    assert.equal(week.columns[2]?.day, "7");
    assert.equal(week.columns[0]?.events.length, 0);
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
    const todayCell = month.cells.find((cell) => cell.isToday);
    assert.equal(todayCell?.extra, 3);
  });

  it("keeps today in column 3 across Bucharest midnight", () => {
    const beforeMidnight = new Date("2026-11-07T21:59:00.000Z");
    const afterMidnight = new Date("2026-11-07T22:00:00.000Z");
    const before = projectWeek(sampleSnapshot(beforeMidnight), beforeMidnight);
    const after = projectWeek(sampleSnapshot(afterMidnight), afterMidnight);
    assert.equal(before.columns[2]?.isToday, true);
    assert.equal(before.columns[2]?.day, "7");
    assert.equal(before.columns[0]?.day, "5");
    assert.equal(after.columns[2]?.isToday, true);
    assert.equal(after.columns[2]?.day, "8");
    assert.equal(after.columns[0]?.day, "6");

    const beforeFall = projectWeek(sampleSnapshot(new Date("2026-10-24T20:59:00.000Z")), new Date("2026-10-24T20:59:00.000Z"));
    const afterFall = projectWeek(sampleSnapshot(new Date("2026-10-24T21:00:00.000Z")), new Date("2026-10-24T21:00:00.000Z"));
    assert.equal(beforeFall.columns[2]?.day, "24");
    assert.equal(afterFall.columns[2]?.day, "25");
    assert.equal(afterFall.columns[2]?.isToday, true);
  });

  it("places an all-day event on each Bucharest day it covers", () => {
    const snapshot = sampleSnapshot(morning);
    snapshot.events = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Concediu",
        start: zonedTimeToUtc({ year: 2026, month: 11, day: 6, hour: 0, minute: 0 }).toISOString(),
        end: zonedTimeToUtc({ year: 2026, month: 11, day: 9, hour: 0, minute: 0 }).toISOString(),
        allDay: true,
        personId: "alex",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Târziu",
        start: zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 23, minute: 0 }).toISOString(),
        end: zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 1, minute: 0 }).toISOString(),
        allDay: false,
        personId: null,
      },
    ];
    const week = projectWeek(snapshot, morning);
    const titles = (day: string) => week.columns.find((column) => column.day === day)?.events.map((event) => event.title) ?? [];
    assert.deepEqual(titles("5"), []);
    assert.deepEqual(titles("6"), ["Concediu"]);
    assert.deepEqual(titles("7"), ["Concediu", "Târziu"]);
    assert.deepEqual(titles("8"), ["Concediu", "Târziu"]);
    assert.deepEqual(titles("9"), []);
    assert.equal(week.columns.find((column) => column.day === "6")?.events[0]?.timeLabel, "Zi");

    const month = projectMonth(snapshot, morning);
    assert.equal(month.cells.find((cell) => cell.key === "2026-11-07")?.title, "Concediu");
    assert.equal(month.cells.find((cell) => cell.key === "2026-11-07")?.extra, 1);
    assert.equal(month.cells.find((cell) => cell.key === "2026-11-09")?.title, null);
  });

  it("hides the weather block when there is no reading", () => {
    const snapshot = sampleSnapshot(morning);
    snapshot.weather = { location: "Constanța", tempC: null, label: null, fetchedAt: null };
    const state = buildTvState(snapshot, morning, "today");
    assert.equal(state.chrome.weather.tempC, "");
    assert.equal(state.chrome.weather.updatedLabel, null);
  });

  it("renders every view from the sample snapshot", () => {
    const snapshot = sampleSnapshot(morning);
    for (const viewId of ["today", "week", "momente", "vision", "home"] as const) {
      const state = buildTvState(snapshot, morning, viewId);
      assert.equal(state.currentView, viewId);
      assert.equal(state[viewId] === null, false);
      assert.equal(Boolean(state.chrome.priority), viewId === "today");
      assert.equal(state.chrome.pills.length, 5);
    }
    const vision = buildTvState(snapshot, morning, "vision").vision;
    assert.ok((vision?.cards.length ?? 0) >= 6);
    const home = buildTvState(snapshot, morning, "home").home;
    assert.ok((home?.stickies.length ?? 0) >= 4);
    assert.ok(home?.stickies.some((sticky) => sticky.kind === "task"));
    assert.ok(home?.stickies.some((sticky) => sticky.kind === "shopping"));
    assert.ok(home?.stickies.some((sticky) => sticky.kind === "message"));
    assert.equal(["roomy", "cozy", "packed"].includes(home?.density ?? ""), true);
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
