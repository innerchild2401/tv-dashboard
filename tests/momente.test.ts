import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryStore } from "../lib/agent/memory";
import { executeTool } from "../lib/agent/tools";
import { sampleSnapshot } from "../lib/state/sample";
import { availability } from "../lib/state/availability";
import { buildTvState } from "../lib/state/build";
import {
  bucharestDaysUntil,
  momenteLayoutForCount,
  projectMomente,
  selectMomenteItems,
} from "../lib/views/momente";
import { zonedTimeToUtc } from "../lib/time/bucharest";
import type { SnapshotSpotlight } from "../lib/state/types";

const noon = zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 12, minute: 0 });

describe("momente day countdown", () => {
  it("counts whole Bucharest calendar days and treats today as zero", () => {
    const sameDay = zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 23, minute: 30 }).toISOString();
    const nextDay = zonedTimeToUtc({ year: 2026, month: 11, day: 9, hour: 0, minute: 30 }).toISOString();
    const inThree = zonedTimeToUtc({ year: 2026, month: 11, day: 11, hour: 9, minute: 0 }).toISOString();
    const yesterday = zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 12, minute: 0 }).toISOString();
    assert.equal(bucharestDaysUntil(sameDay, noon), 0);
    assert.equal(bucharestDaysUntil(nextDay, noon), 1);
    assert.equal(bucharestDaysUntil(inThree, noon), 3);
    assert.equal(bucharestDaysUntil(yesterday, noon), -1);
  });

  it("hides past items and labels today as azi", () => {
    const rows: SnapshotSpotlight[] = [
      {
        id: "past",
        title: "Trecut",
        kind: "other",
        startsAt: zonedTimeToUtc({ year: 2026, month: 11, day: 7, hour: 10, minute: 0 }).toISOString(),
        note: null,
        pinned: false,
      },
      {
        id: "today",
        title: "Astăzi",
        kind: "deadline",
        startsAt: zonedTimeToUtc({ year: 2026, month: 11, day: 8, hour: 18, minute: 0 }).toISOString(),
        note: null,
        pinned: false,
      },
      {
        id: "soon",
        title: "Curând",
        kind: "trip",
        startsAt: zonedTimeToUtc({ year: 2026, month: 11, day: 10, hour: 8, minute: 0 }).toISOString(),
        note: "Dimineața",
        pinned: true,
      },
    ];
    const selected = selectMomenteItems(rows, noon);
    assert.equal(selected.items.length, 2);
    assert.equal(selected.items[0]?.id, "soon");
    assert.equal(selected.items[0]?.pinned, true);
    assert.equal(selected.items[1]?.today, true);
    assert.equal(selected.items[1]?.daysLabel, "azi");
    assert.equal(selected.items[1]?.unitLabel, null);
  });
});

describe("momente layout buckets", () => {
  it("maps counts to Cast-friendly layout classes", () => {
    assert.equal(momenteLayoutForCount(0), "empty");
    assert.equal(momenteLayoutForCount(1), "solo");
    assert.equal(momenteLayoutForCount(2), "split");
    assert.equal(momenteLayoutForCount(3), "tiles");
    assert.equal(momenteLayoutForCount(4), "tiles");
    assert.equal(momenteLayoutForCount(5), "dense");
    assert.equal(momenteLayoutForCount(6), "dense");
    assert.equal(momenteLayoutForCount(7), "overflow");
  });

  it("keeps pinned and soonest when more than six", () => {
    const rows: SnapshotSpotlight[] = Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      title: `Moment ${index}`,
      kind: "other" as const,
      startsAt: zonedTimeToUtc({ year: 2026, month: 11, day: 9 + index, hour: 10, minute: 0 }).toISOString(),
      note: null,
      pinned: index === 7,
    }));
    const selected = selectMomenteItems(rows, noon);
    assert.equal(selected.items.length, 6);
    assert.equal(selected.hidden, 2);
    assert.equal(selected.layout, "overflow");
    assert.ok(selected.items.some((item) => item.id === "s7"));
  });
});

describe("momente rotation and state", () => {
  it("uses momente instead of month and skips when empty", () => {
    const snapshot = sampleSnapshot(noon);
    assert.ok(snapshot.config.views.some((view) => view.id === "momente"));
    assert.equal(snapshot.config.views.some((view) => view.id === "month"), false);
    const flags = availability(snapshot, noon);
    assert.equal(flags.momente.empty, false);
    snapshot.spotlights = [];
    assert.equal(availability(snapshot, noon).momente.empty, true);

    const state = buildTvState(sampleSnapshot(noon), noon, "momente");
    assert.equal(state.currentView, "momente");
    assert.ok(state.momente);
    assert.ok((state.momente?.items.length ?? 0) >= 2);
    assert.equal(state.momente?.layout, "split");
    const projected = projectMomente(sampleSnapshot(noon), noon);
    assert.equal(projected.items[0]?.kindLabel, "Călătorie");
  });
});

describe("momente agent tools", () => {
  it("upserts and deletes spotlights idempotently and documents them in get_schema", async () => {
    const store = new MemoryStore();
    const created = await executeTool(
      "upsert_spotlight",
      {
        externalId: "trip-ski-2027",
        title: "Vacanță la munte",
        kind: "trip",
        startsAt: "2027-01-12T08:00:00+02:00",
        pinned: true,
      },
      { store, now: noon },
    );
    assert.equal(created.ok, true);
    const again = await executeTool(
      "upsert_spotlight",
      {
        externalId: "trip-ski-2027",
        title: "Vacanță la munte",
        kind: "trip",
        startsAt: "2027-01-12T08:00:00+02:00",
        note: "Plecare",
      },
      { store, now: noon },
    );
    assert.equal(again.ok, true);
    assert.equal((await store.spotlights()).filter((row) => !row.deletedAt).length, 1);
    assert.equal((await store.spotlights())[0]?.note, "Plecare");

    const schema = await executeTool("get_schema", {}, { store, now: noon });
    assert.equal(schema.ok, true);
    const body = schema.schema as { momente?: { tools?: { upsert_spotlight?: unknown }; viewId?: string } };
    assert.equal(body.momente?.viewId, "momente");
    assert.ok(body.momente?.tools?.upsert_spotlight);

    const removed = await executeTool("delete_spotlight", { externalId: "trip-ski-2027" }, { store, now: noon });
    assert.equal(removed.ok, true);
    assert.ok((await store.spotlights())[0]?.deletedAt);
  });
});
