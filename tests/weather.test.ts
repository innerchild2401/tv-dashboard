import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LOCATION, openMeteoUrl, parseOpenMeteo, weatherLabel } from "../lib/adapters/weather";

describe("Open-Meteo weather", () => {
  it("uses the configured coordinates and Romanian labels", () => {
    const url = new URL(openMeteoUrl(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude));
    assert.equal(url.hostname, "api.open-meteo.com");
    assert.equal(url.searchParams.get("latitude"), "44.1598");
    assert.equal(url.searchParams.get("longitude"), "28.6348");
    assert.equal(url.searchParams.get("timezone"), "Europe/Bucharest");
    assert.equal(DEFAULT_LOCATION.name, "Constanța");
    assert.equal(weatherLabel(2), "Parțial noros");
    assert.equal(weatherLabel(95), "Furtună");
    assert.equal(weatherLabel(1234), "Vreme");
  });

  it("reads the current reading and returns nothing for a bad payload", () => {
    const parsed = parseOpenMeteo({ current: { temperature_2m: 11.6, weather_code: 3 } });
    assert.deepEqual(parsed, { tempC: 12, code: 3, label: "Înnorat" });
    const legacy = parseOpenMeteo({ current_weather: { temperature: -1.2, weathercode: 71 } });
    assert.equal(legacy?.tempC, -1);
    assert.equal(legacy?.label, "Ninsoare slabă");
    assert.equal(parseOpenMeteo({}), null);
    assert.equal(parseOpenMeteo(null), null);
  });
});
