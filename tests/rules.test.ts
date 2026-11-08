import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configSchema } from "../lib/schemas";
import { sampleConfig } from "../lib/seed/sample-config";
import { evaluateRules } from "../lib/rotation/rules";
import { viewCandidates } from "../lib/state/availability";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import type { DashboardConfig, Snapshot } from "../lib/state/types";
import { zonedTimeToUtc } from "../lib/time/bucharest";

const morning = new Date("2026-11-07T06:00:00.000Z");

function snapshotAt(now: Date): Snapshot {
  return sampleSnapshot(now);
}

function decide(snapshot: Snapshot, now: Date, rules?: Partial<DashboardConfig["rules"]>) {
  if (rules) snapshot.config.rules = { ...snapshot.config.rules, ...rules };
  return evaluateRules({
    now,
    config: snapshot.config,
    events: snapshot.events,
    priorities: snapshot.priorities,
    metrics: snapshot.metrics,
    forecast: snapshot.weather.hours ?? [],
    candidates: viewCandidates(snapshot, now),
  });
}

describe("smart rules", () => {
  it("keeps a saved config that does not know the new switches", () => {
    const legacy = { ...sampleConfig, rules: { todayLeadTomorrowHour: 20, skipEmpty: true, quietHours: false, interrupts: true } };
    const parsed = configSchema.parse(legacy);
    assert.equal(parsed.rules.timeOfDay, true);
    assert.equal(parsed.rules.eventProximity, true);
    assert.equal(parsed.rules.priorityBanner, true);
    assert.equal(parsed.rules.celebrations, true);
    assert.equal(parsed.rules.weatherAlert, true);
    assert.equal(parsed.rules.quietHours, false);
  });

  it("uses the morning profile and can turn it off", () => {
    const on = decide(snapshotAt(morning), morning);
    assert.equal(on.notices.some((notice) => notice.id === "timeOfDay" && notice.reason.includes("Dimineața")), true);
    const seen = new Set<string>();
    for (let minute = 0; minute < 50; minute += 1) {
      const now = new Date(morning.getTime() + minute * 60_000);
      seen.add(decide(snapshotAt(now), now).viewId);
    }
    assert.deepEqual([...seen].sort(), ["today", "vision", "week"]);

    const off = decide(snapshotAt(morning), morning, { timeOfDay: false });
    assert.equal(off.notices.some((notice) => notice.id === "timeOfDay"), false);
  });

  it("shows Today for an event inside 30 minutes and explains it", () => {
    const near = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 8, minute: 35 });
    let matched = false;
    for (let minute = 31; minute < 59; minute += 1) {
      const now = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 8, minute });
      const on = decide(snapshotAt(now), now);
      assert.equal(on.notices.some((notice) => notice.id === "eventProximity"), true);
      if (!on.reason.startsWith("Eveniment în")) continue;
      matched = true;
      const off = decide(snapshotAt(now), now, { eventProximity: false });
      assert.equal(off.notices.some((notice) => notice.id === "eventProximity"), false);
      assert.notEqual(off.reason, on.reason);
      break;
    }
    assert.equal(matched, true);
    assert.equal(decide(snapshotAt(near), near).notices.some((notice) => notice.reason.includes("Întâlnire")), true);
  });

  it("puts the priority banner on Today and on every view when it is due soon", () => {
    const snapshot = snapshotAt(morning);
    const today = buildTvState(snapshot, morning, "today");
    const week = buildTvState(snapshot, morning, "week");
    assert.equal(today.chrome.priority?.reason, snapshot.priorities[0]?.reason);
    assert.equal(week.chrome.priority, null);
    assert.equal(today.notices.some((notice) => notice.id === "priorityBanner"), true);

    snapshot.config.rules.priorityBanner = false;
    const hidden = buildTvState(snapshot, morning, "today");
    assert.equal(hidden.chrome.priority, null);
    assert.equal(hidden.notices.some((notice) => notice.id === "priorityBanner"), false);

    const due = snapshotAt(morning);
    const dueAt = new Date(morning.getTime() + 90 * 60 * 1000).toISOString();
    const priority = due.priorities[0];
    if (!priority) throw new Error("missing priority");
    priority.dueAt = dueAt;
    const soon = decide(due, morning);
    assert.equal(soon.notices.some((notice) => notice.id === "priorityBanner" && notice.reason.includes("90")), true);
    assert.equal(soon.priorityEverywhere, true);
    const banner = buildTvState(due, morning, "week");
    assert.ok(banner.chrome.priority);
  });

  it("adds a celebration card for a birthday and for a metric that doubles its week", () => {
    const snapshot = snapshotAt(morning);
    snapshot.events.push({
      id: "birthday",
      title: "Aniversare",
      start: morning.toISOString(),
      end: new Date(morning.getTime() + 60 * 60 * 1000).toISOString(),
      allDay: true,
      personId: "mara",
    });
    const on = buildTvState(snapshot, morning, "vision");
    assert.equal(on.vision?.cards.some((card) => card.body?.includes("Aniversare")), true);
    assert.equal(on.notices.some((notice) => notice.id === "celebrations"), true);

    snapshot.config.rules.celebrations = false;
    const off = buildTvState(snapshot, morning, "vision");
    assert.equal(off.vision?.cards.some((card) => card.id === "celebration"), false);
    assert.equal(off.notices.some((notice) => notice.id === "celebrations"), false);

    const spiked = snapshotAt(morning);
    for (const metric of spiked.metrics) {
      if (!metric.key.startsWith("site.day.")) continue;
      metric.value = metric.key.endsWith("2026-11-07") ? 500 : 40;
    }
    const site = buildTvState(spiked, morning, "site");
    assert.match(site.site?.celebration ?? "", /Site/);
    assert.equal(site.notices.some((notice) => notice.id === "celebrations"), true);
    spiked.config.rules.celebrations = false;
    assert.equal(buildTvState(spiked, morning, "site").site?.celebration, null);
  });

  it("warns when rain is forecast beside an outdoor plan", () => {
    const now = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 8, minute: 40 });
    const snapshot = snapshotAt(now);
    snapshot.events.push({
      id: "walk",
      title: "Plimbare pe faleză",
      start: zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 9, minute: 20 }).toISOString(),
      end: zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 10, minute: 20 }).toISOString(),
      allDay: false,
      personId: "alex",
    });
    snapshot.weather.hours = [{ time: "2026-11-07T09:00", code: 61, precipitationMm: 1.2 }];
    const on = decide(snapshot, now);
    assert.match(on.alert ?? "", /Plimbare/);
    assert.equal(on.notices.some((notice) => notice.id === "weatherAlert"), true);
    const state = buildTvState(snapshot, now, "today");
    assert.match(state.chrome.alert ?? "", /Ploaie/);

    snapshot.config.rules.weatherAlert = false;
    const off = decide(snapshot, now);
    assert.equal(off.alert, null);
    assert.equal(off.notices.some((notice) => notice.id === "weatherAlert"), false);
  });

  it("shows only the clock during quiet hours", () => {
    const night = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 23, minute: 30 });
    const on = decide(snapshotAt(night), night);
    assert.equal(on.quiet, true);
    assert.equal(on.reason, "Ore liniștite");
    const state = buildTvState(snapshotAt(night), night);
    assert.equal(state.quiet, true);
    assert.equal(state.today, null);

    const off = decide(snapshotAt(night), night, { quietHours: false });
    assert.equal(off.quiet, false);
    assert.equal(off.notices.some((notice) => notice.id === "quietHours"), false);
  });

  it("labels stale and sample metrics and still draws the numbers", () => {
    const now = morning;
    const sample = buildTvState(snapshotAt(now), now, "site").site;
    assert.equal(sample?.updatedLabel, "Date de exemplu");
    assert.equal(sample?.series.length, 30);
    assert.notEqual(sample?.stats[0]?.value, "");

    const old = snapshotAt(now);
    const fetchedAt = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    for (const metric of old.metrics) {
      if (!metric.key.startsWith("site.")) continue;
      metric.source = "integration";
      metric.fetchedAt = fetchedAt;
    }
    const kept = buildTvState(old, now, "site").site;
    assert.match(kept?.updatedLabel ?? "", /3 h/);
    assert.equal(kept?.series.length, 30);

    const empty = snapshotAt(now);
    empty.metrics = empty.metrics.filter((metric) => !metric.key.startsWith("tiktok."));
    const tiktok = buildTvState(empty, now, "tiktok").tiktok;
    assert.equal(tiktok?.followers.value, "0");
    assert.equal(tiktok?.updatedLabel, "Date de exemplu");
  });
});
