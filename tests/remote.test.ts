import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PIN_ATTEMPTS, decidePin } from "../lib/auth/pin";
import { SESSION_MS, signSession, verifySession } from "../lib/auth/session";
import { imageKind } from "../lib/photos/sniff";
import { applyControl, ROTATE_CONTROL } from "../lib/remote/hold";
import { plainText } from "../lib/remote/text";
import { accentColor } from "../lib/theme/accent";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";

const secret = "test-session-secret";
const now = new Date("2026-11-07T10:00:00.000Z");

describe("phone PIN and session", () => {
  it("locks after five mismatches and keeps a 30 day session", () => {
    let guard = { failures: 0, lockedUntil: null as string | null };
    for (let attempt = 1; attempt < PIN_ATTEMPTS; attempt += 1) {
      const decision = decidePin(guard, "1234", false, now);
      assert.equal(decision.ok, false);
      if (!decision.ok) {
        assert.equal(decision.reason, "mismatch");
        guard = decision.guard;
      }
    }
    const locked = decidePin(guard, "1234", false, now);
    assert.equal(locked.ok, false);
    if (!locked.ok) {
      assert.equal(locked.reason, "locked");
      assert.equal(decidePin(locked.guard, "1234", true, now).ok, false);
      const later = new Date(now.getTime() + 15 * 60 * 1000 + 1);
      const again = decidePin(locked.guard, "1234", true, later);
      assert.equal(again.ok, true);
    }
    const bad = decidePin({ failures: 0, lockedUntil: null }, "12", false, now);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, "format");

    const token = signSession(secret, now.getTime());
    assert.equal(verifySession(token, secret, now.getTime() + SESSION_MS - 1000), true);
    assert.equal(verifySession(token, secret, now.getTime() + SESSION_MS + 1000), false);
    assert.equal(verifySession(`${token}x`, secret, now.getTime()), false);
    assert.equal(verifySession(token, "other-secret", now.getTime()), false);
  });
});

describe("phone controls reach the TV state", () => {
  const views = [
    { id: "today" as const, enabled: true, order: 1, dwellSeconds: 120, weight: 1 },
    { id: "week" as const, enabled: true, order: 2, dwellSeconds: 120, weight: 1 },
    { id: "home" as const, enabled: true, order: 3, dwellSeconds: 120, weight: 1 },
  ];

  it("locks a view, dims without switching, and drops an expired pin", () => {
    const locked = applyControl(ROTATE_CONTROL, { type: "lock", viewId: "home" }, { now, currentView: "today", views });
    assert.equal(locked.ok, true);
    if (!locked.ok) return;
    const snapshot = sampleSnapshot(now);
    snapshot.config.theme.accent = "#F58FB6";
    const state = buildTvState(snapshot, now, null, { ...locked.control, dimmed: true });
    assert.equal(state.currentView, "home");
    assert.equal(state.hold, "locked");
    assert.equal(state.dimmed, true);
    assert.equal(state.chrome.accent, "#F58FB6");
    assert.equal(state.chrome.priority === null, false);

    const dimmed = applyControl(ROTATE_CONTROL, { type: "dim" }, { now, currentView: "today", views });
    assert.equal(dimmed.ok, true);
    if (dimmed.ok) assert.equal(dimmed.control.mode, "rotate");

    const pinned = applyControl(ROTATE_CONTROL, { type: "pin", minutes: 10 }, { now, currentView: "week", views });
    assert.equal(pinned.ok, true);
    if (!pinned.ok) return;
    const expired = buildTvState(snapshot, new Date(now.getTime() + 11 * 60_000), null, pinned.control);
    assert.equal(expired.hold, "rotate");
    assert.equal(plainText("<b>Salut</b>"), "Salut");
    assert.equal(accentColor("teal"), "#5EEAD4");
    assert.equal(imageKind(Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
    assert.equal(imageKind(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), null);
  });
});

describe("installable remote", () => {
  it("ships a manifest and a service worker for the phone shell", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8")) as {
      start_url: string;
      display: string;
      icons: { sizes: string }[];
      share_target: { action: string; method: string };
    };
    assert.equal(manifest.start_url, "/remote");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.icons.some((icon) => icon.sizes === "192x192"), true);
    assert.equal(manifest.icons.some((icon) => icon.sizes === "512x512"), true);
    assert.equal(manifest.share_target.action, "/remote/inbox/share");
    assert.equal(manifest.share_target.method, "POST");
    const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    assert.equal(worker.includes("/remote"), true);
    assert.equal(worker.includes("/api/"), true);
  });
});
