import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  analyticsAdapter,
  fetchAnalytics,
  parseGa4,
  parsePlausible,
  parseUmami,
  reportToMetrics,
} from "../lib/adapters/analytics";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/analytics/${name}.json`, import.meta.url), "utf8"));
}

describe("analytics adapters", () => {
  const now = new Date("2026-11-07T08:00:00.000Z");

  it("reads Plausible, Umami and GA4 fixtures into the same report", () => {
    const plausible = parsePlausible(fixture("plausible"));
    const umami = parseUmami(fixture("umami"));
    const ga4 = parseGa4(fixture("ga4"));
    assert.equal(plausible?.days.at(-1)?.visitors, 55);
    assert.equal(plausible?.pages[0]?.name, "/");
    assert.equal(plausible?.sources[1]?.name, "Căutare");
    assert.equal(umami?.days[0]?.date, "2026-11-06");
    assert.equal(umami?.pages[1]?.visitors, 4);
    assert.equal(ga4?.days[1]?.date, "2026-11-07");
    assert.equal(ga4?.sources[0]?.name, "google");
    assert.equal(parsePlausible({}), null);
    assert.equal(parseUmami(null), null);
    assert.equal(parseGa4({ days: {} }), null);

    const rows = reportToMetrics(plausible ?? { days: [], pages: [], sources: [] }, now);
    assert.equal(rows.some((row) => row.key === "site.day.2026-11-07" && row.value === 55), true);
    assert.equal(rows.some((row) => row.key === "site.visitors.today"), true);
    assert.equal(rows.some((row) => row.key === "site.page.acasa"), true);
    assert.equal(rows.some((row) => row.key === "site.source.direct"), true);
  });

  it("stays idle when the provider or its key is missing", async () => {
    assert.equal(analyticsAdapter({}), null);
    assert.equal(analyticsAdapter({ ANALYTICS_PROVIDER: "plausible", PLAUSIBLE_API_KEY: "present" }), null);
    assert.equal(
      analyticsAdapter({
        ANALYTICS_PROVIDER: "plausible",
        PLAUSIBLE_API_KEY: "present",
        PLAUSIBLE_SITE_ID: "example.com",
      })?.id,
      "plausible",
    );
    let called = false;
    const outcome = await fetchAnalytics({}, async () => {
      called = true;
      throw new Error("should not run");
    }, now);
    assert.equal(outcome.status, "unconfigured");
    assert.equal(called, false);

    const failed = await fetchAnalytics(
      { ANALYTICS_PROVIDER: "ga4", GA4_PROPERTY_ID: "1", GA4_ACCESS_TOKEN: "present" },
      async () => {
        throw new Error("down");
      },
      now,
    );
    assert.equal(failed.status, "failed");
    assert.equal(JSON.stringify(failed).includes("present"), false);
  });
});
