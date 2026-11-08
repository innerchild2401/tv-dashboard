import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { expandIcal } from "../lib/adapters/ical";
import type { ExpandedEvent } from "../lib/adapters/ical";

const now = new Date("2026-11-07T10:00:00.000Z");
const ics = readFileSync(new URL("./fixtures/calendar/household.ics", import.meta.url), "utf8");

function events(): ExpandedEvent[] {
  const parsed = expandIcal(ics, { personId: "alex", now });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return [];
  return parsed.events;
}

function byTitle(title: string, start?: string): ExpandedEvent | undefined {
  return events().find((event) => event.title === title && (start === undefined || event.start === start));
}

describe("iCal adapter", () => {
  it("converts time zones, expands rules, and keeps all-day dates", () => {
    const parsed = events();
    const meeting = byTitle("Ședință");
    assert.equal(meeting?.start, "2026-11-09T07:00:00.000Z");
    assert.equal(meeting?.end, "2026-11-09T08:30:00.000Z");
    assert.equal(meeting?.allDay, false);
    assert.equal(meeting?.personId, "alex");

    assert.equal(byTitle("Sport", "2026-10-19T15:00:00.000Z")?.end, "2026-10-19T16:00:00.000Z");
    assert.equal(byTitle("Sport", "2026-10-26T16:00:00.000Z")?.start, "2026-10-26T16:00:00.000Z");
    assert.equal(byTitle("Sport", "2026-11-09T16:00:00.000Z")?.end, "2026-11-09T17:00:00.000Z");
    assert.equal(
      parsed.some((event) => event.title === "Sport" && event.start.startsWith("2026-11-02")),
      false,
    );

    const vacation = byTitle("Concediu");
    assert.equal(vacation?.allDay, true);
    assert.equal(vacation?.start, "2026-11-09T22:00:00.000Z");
    assert.equal(vacation?.end, "2026-11-12T22:00:00.000Z");

    assert.ok(byTitle("Piață", "2026-11-01T22:00:00.000Z"));
    assert.equal(
      parsed.some((event) => event.title === "Piață" && event.start === "2026-11-15T22:00:00.000Z"),
      false,
    );

    assert.equal(byTitle("Apel")?.start, "2026-11-08T14:00:00.000Z");
    assert.equal(byTitle("New York")?.start, "2026-11-09T14:00:00.000Z");
    assert.equal(byTitle("New York")?.end, "2026-11-09T15:00:00.000Z");
    assert.equal(byTitle("Margine")?.start, "2026-09-23T07:00:00.000Z");
    assert.equal(parsed.some((event) => event.title === "Devreme" || event.title === "Departe"), false);
    assert.equal(parsed.some((event) => event.title === "Anulat"), false);
    assert.equal(byTitle("Cafea & ceai")?.start, "2026-11-12T10:00:00.000Z");

    assert.equal(byTitle("Recurent", "2026-11-02T08:00:00.000Z")?.end, "2026-11-02T09:00:00.000Z");
    assert.equal(byTitle("Recurent mutat")?.start, "2026-11-16T13:00:00.000Z");
    assert.equal(byTitle("Recurent mutat")?.end, "2026-11-16T14:00:00.000Z");
    assert.equal(
      parsed.some((event) => event.title === "Recurent" && event.start === "2026-11-16T08:00:00.000Z"),
      false,
    );
  });

  it("keeps the same instants when the process zone is Bucharest", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "tests/ical-zone-check.ts"], {
      env: { ...process.env, TZ: "Europe/Bucharest" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  it("rejects a body that is not a calendar and accepts an empty one", () => {
    assert.equal(expandIcal("not a calendar", { personId: "alex", now }).ok, false);
    const empty = expandIcal("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n", { personId: "alex", now });
    assert.deepEqual(empty, { ok: true, events: [] });
  });
});
