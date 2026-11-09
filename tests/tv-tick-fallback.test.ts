import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

describe("tv-tick Cast fallback", () => {
  const source = readFileSync(join(process.cwd(), "public/tv-tick.js"), "utf8");

  it("navigates with the next view instead of only reloading", () => {
    assert.match(source, /data-next-view/);
    assert.match(source, /searchParams\.set\("view"/);
    assert.match(source, /location\.assign/);
  });

  it("does not full-navigate while React is live (avoids DashCast flash)", () => {
    assert.match(source, /When React is live it rotates via \/api\/state/);
    assert.match(source, /if \(live\) return;/);
    assert.doesNotMatch(source, /var grace = live \? LIVE_GRACE_MS : 0;/);
  });

  it("stays ES5-safe for classic Cast Chromium", () => {
    assert.doesNotMatch(source, /\?\./);
    assert.doesNotMatch(source, /\?\?/);
    assert.doesNotMatch(source, /\bconst\b/);
    assert.doesNotMatch(source, /\blet\b/);
    assert.doesNotMatch(source, /=>/);
  });

  it("fits the 1280×720 design into the Cast safe viewport without React", () => {
    assert.match(source, /DESIGN_W = 1280/);
    assert.match(source, /DESIGN_H = 720/);
    assert.match(source, /SAFE_FRACTION = 0\.9/);
    assert.match(source, /--tv-scale/);
    assert.match(source, /applyFit/);
  });

  it("soft-ticks Momente countdown digits without React", () => {
    assert.match(source, /data-tv-countdown/);
    assert.match(source, /paintCountdowns/);
    assert.match(source, /is-tick/);
  });
});
