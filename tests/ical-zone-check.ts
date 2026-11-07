import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expandIcal } from "../lib/adapters/ical";

const now = new Date("2026-11-07T10:00:00.000Z");
const ics = readFileSync(new URL("./fixtures/calendar/household.ics", import.meta.url), "utf8");
const parsed = expandIcal(ics, { personId: "alex", now });
assert.equal(parsed.ok, true);
if (!parsed.ok) process.exit(1);
const sport = parsed.events.filter((event) => event.title === "Sport");
assert.ok(sport.some((event) => event.start === "2026-10-19T15:00:00.000Z"));
assert.ok(sport.some((event) => event.start === "2026-10-26T16:00:00.000Z"));
assert.equal(
  sport.some((event) => event.start.startsWith("2026-11-02")),
  false,
);
const vacation = parsed.events.find((event) => event.title === "Concediu");
assert.equal(vacation?.start, "2026-11-09T22:00:00.000Z");
assert.equal(vacation?.end, "2026-11-12T22:00:00.000Z");
assert.equal(
  parsed.events.some((event) => event.title === "Piață" && event.start === "2026-11-15T22:00:00.000Z"),
  false,
);
