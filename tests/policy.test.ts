import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CALENDAR_INTERVAL_MS, shouldRefresh, WEATHER_INTERVAL_MS } from "../lib/adapters/intervals";
import { calendarUrlFromEnv, fetchText, outcomeFromFeed } from "../lib/adapters/policy";

const now = new Date("2026-11-07T10:00:00.000Z");

describe("calendar refresh policy", () => {
  it("ignores a missing or invalid address and does not replace events", () => {
    assert.equal(calendarUrlFromEnv("alex", {}), null);
    assert.equal(calendarUrlFromEnv("alex", { ICAL_URL_ALEX: "   " }), null);
    assert.equal(calendarUrlFromEnv("alex", { ICAL_URL_ALEX: "not a url" }), null);
    assert.equal(calendarUrlFromEnv("alex", { ICAL_URL_ALEX: "http://calendar.example.test/a.ics" }), null);
    assert.equal(
      calendarUrlFromEnv("alex", { ICAL_URL_ALEX: "https://calendar.example.test/alex.ics" }),
      "https://calendar.example.test/alex.ics",
    );
    const missing = outcomeFromFeed({ url: null, due: true, fetched: null, personId: "alex", now });
    assert.deepEqual(missing, { status: "unconfigured", replace: false });
  });

  it("keeps the previous events when the feed fails or is unchanged", () => {
    assert.deepEqual(outcomeFromFeed({ url: "https://calendar.example.test/a.ics", due: false, fetched: null, personId: "alex", now }), {
      status: "skipped",
      replace: false,
    });
    assert.equal(
      outcomeFromFeed({
        url: "https://calendar.example.test/a.ics",
        due: true,
        fetched: { kind: "failed" },
        personId: "alex",
        now,
      }).replace,
      false,
    );
    assert.equal(
      outcomeFromFeed({
        url: "https://calendar.example.test/a.ics",
        due: true,
        fetched: { kind: "not_modified" },
        personId: "alex",
        now,
      }).status,
      "not_modified",
    );
    assert.equal(
      outcomeFromFeed({
        url: "https://calendar.example.test/a.ics",
        due: true,
        fetched: { kind: "ok", body: "nope", etag: null },
        personId: "alex",
        now,
      }).status,
      "failed",
    );
  });

  it("waits five minutes for calendar and thirty for weather", () => {
    const attempted = new Date(now.getTime() - CALENDAR_INTERVAL_MS + 1000).toISOString();
    assert.equal(shouldRefresh(attempted, now, CALENDAR_INTERVAL_MS), false);
    assert.equal(shouldRefresh(new Date(now.getTime() - CALENDAR_INTERVAL_MS).toISOString(), now, CALENDAR_INTERVAL_MS), true);
    assert.equal(shouldRefresh(null, now, WEATHER_INTERVAL_MS), true);
    assert.equal(shouldRefresh(new Date(now.getTime() - WEATHER_INTERVAL_MS + 1).toISOString(), now, WEATHER_INTERVAL_MS), false);
  });

  it("sends the previous ETag and treats 304 and errors as non-updates", async () => {
    const seen: { etag?: string } = {};
    const notModified = await fetchText("https://calendar.example.test/a.ics", '"abc"', async (_url, init) => {
      seen.etag = new Headers(init?.headers).get("if-none-match") ?? undefined;
      return new Response(null, { status: 304 });
    });
    assert.equal(seen.etag, '"abc"');
    assert.deepEqual(notModified, { kind: "not_modified" });

    const failed = await fetchText("https://calendar.example.test/a.ics", null, async () => new Response("no", { status: 500 }));
    assert.deepEqual(failed, { kind: "failed" });
    const thrown = await fetchText("https://calendar.example.test/a.ics", null, async () => {
      throw new Error("offline");
    });
    assert.deepEqual(thrown, { kind: "failed" });
  });
});
