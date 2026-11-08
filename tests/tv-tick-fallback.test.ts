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
    assert.match(source, /LIVE_GRACE_MS/);
  });

  it("stays ES5-safe for classic Cast Chromium", () => {
    assert.doesNotMatch(source, /\?\./);
    assert.doesNotMatch(source, /\?\?/);
    assert.doesNotMatch(source, /\bconst\b/);
    assert.doesNotMatch(source, /\blet\b/);
    assert.doesNotMatch(source, /=>/);
  });
});
