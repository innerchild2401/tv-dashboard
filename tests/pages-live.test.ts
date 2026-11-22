import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryStore } from "../lib/agent/memory";
import { executeTool } from "../lib/agent/tools";
import { viewDesignPayload } from "../lib/agent/design";
import { LIVE_VIEW_ID } from "../i18n/ro";
import { ANTENA3_STREAM_URL } from "../lib/live/antena3";
import { LIVE_CHANNELS } from "../lib/live/channels";
import { probeHlsUrl } from "../lib/live/playback";
import { isControlViewId, isViewId } from "../lib/remote/config";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import { celebrationDay } from "../i18n/ro";
import type { DisplayControl } from "../lib/remote/hold";

describe("custom pages and live TV", () => {
  it("documents page and live design contracts", () => {
    const pages = viewDesignPayload("custom-page");
    assert.equal(pages.view?.viewId, "custom-page");
    const live = viewDesignPayload("antena3");
    assert.equal(live.view?.viewId, "antena3");
    assert.ok(live.view && "channels" in live.view);
    const all = viewDesignPayload();
    assert.ok(all.pages);
    assert.ok(all.live);
  });

  it("upserts a page into rotation and can disable it", async () => {
    const store = new MemoryStore();
    const created = await executeTool(
      "upsert_page",
      { id: "reguli-familie", title: "Reguli", body: "Fără telefon la masă", enabled: true },
      { store },
    );
    assert.equal(created.ok, true);
    const views = await store.views();
    assert.ok(views.some((view) => view.id === "reguli-familie" && view.enabled));
    const pages = await store.pages();
    assert.equal(pages[0]?.title, "Reguli");

    const off = await executeTool("upsert_page", { id: "reguli-familie", title: "Reguli", enabled: false }, { store });
    assert.equal(off.ok, true);
    assert.equal((await store.views()).find((view) => view.id === "reguli-familie")?.enabled, false);

    const removed = await executeTool("delete_page", { id: "reguli-familie" }, { store });
    assert.equal(removed.ok, true);
    assert.equal((await store.pages()).length, 0);
  });

  it("refuses reserved page ids", async () => {
    const store = new MemoryStore();
    const refused = await executeTool("upsert_page", { id: "vision", title: "Nope" }, { store });
    assert.equal(refused.ok, false);
  });

  it("starts and stops antena3 without putting it in rotation", async () => {
    const store = new MemoryStore();
    const now = new Date("2026-11-18T12:00:00.000Z");
    const start = await executeTool("start_antena3_live", { minutes: 15 }, { store, now });
    assert.equal(start.ok, true);
    const control = await store.control();
    assert.equal(control.mode, "pinned");
    assert.equal(control.viewId, LIVE_VIEW_ID);
    assert.equal((await store.views()).some((view) => view.id === LIVE_VIEW_ID), false);

    const snapshot = sampleSnapshot(now);
    const state = buildTvState(snapshot, now, null, control);
    assert.equal(state.currentView, LIVE_VIEW_ID);
    assert.ok(state.live?.streamUrl);
    assert.equal(state.live?.inPageOk, true);
    assert.ok(state.buildId);

    const stop = await executeTool("stop_antena3_live", {}, { store, now });
    assert.equal(stop.ok, true);
    assert.equal((await store.control()).mode, "rotate");
  });

  it("starts kanal-d via start_live_channel and marks digi24 cast-only", async () => {
    const store = new MemoryStore();
    const now = new Date("2026-11-18T12:00:00.000Z");
    const start = await executeTool("start_live_channel", { channel: "kanal-d", minutes: 20 }, { store, now });
    assert.equal(start.ok, true);
    assert.equal((await store.control()).viewId, "kanal-d");
    const state = buildTvState(sampleSnapshot(now), now, null, await store.control());
    assert.equal(state.currentView, "kanal-d");
    assert.equal(state.live?.provider, "kanal-d");
    assert.equal(state.live?.streamUrl, LIVE_CHANNELS["kanal-d"].streamUrl);
    assert.equal(state.live?.inPageOk, true);

    const digi = await executeTool("start_live_channel", { channel: "digi24", minutes: 10 }, { store, now });
    assert.equal(digi.ok, true);
    const digiState = buildTvState(sampleSnapshot(now), now, null, await store.control());
    assert.equal(digiState.live?.inPageOk, false);
    assert.equal(digiState.live?.provider, "digi24");

    const stop = await executeTool("stop_live_channel", {}, { store, now });
    assert.equal(stop.ok, true);
    assert.equal((await store.control()).mode, "rotate");
  });

  it("lets /api/state read live pins (control view ids include overlay)", () => {
    assert.equal(isViewId(LIVE_VIEW_ID), false);
    assert.equal(isViewId("digi24"), false);
    assert.equal(isControlViewId(LIVE_VIEW_ID), true);
    assert.equal(isControlViewId("kanal-d"), true);
    assert.equal(isControlViewId("vision"), true);
    assert.equal(isControlViewId("bad id"), false);
  });

  it("keeps live pin over Cast soft-rotate ?view= force", () => {
    const now = new Date("2026-11-18T12:00:00.000Z");
    const control: DisplayControl = {
      mode: "pinned",
      viewId: LIVE_VIEW_ID,
      pinnedUntil: new Date(now.getTime() + 15 * 60_000).toISOString(),
      dimmed: false,
    };
    const state = buildTvState(sampleSnapshot(now), now, "home", control);
    assert.equal(state.currentView, LIVE_VIEW_ID);
    assert.equal(state.hold, "pinned");
    assert.ok(state.live?.streamUrl);
  });

  it("formats celebration without Aniversare azi: Aniversare", () => {
    assert.equal(celebrationDay("Aniversare"), null);
    assert.equal(celebrationDay("Ziua de naștere Zian"), "Aniversare azi: Zian");
  });

  it("probes the free Antena 3 HLS master without VAST wrappers", async () => {
    assert.match(ANTENA3_STREAM_URL, /a3free\.m3u8$/);
    assert.doesNotMatch(ANTENA3_STREAM_URL, /imasdk|vast|token=/i);
    const probe = await probeHlsUrl(ANTENA3_STREAM_URL, async () => {
      return new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n", {
        status: 200,
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      });
    });
    // HEAD without body still counts as ok + looksLikeHls via content-type / URL.
    assert.equal(probe.ok, true);
    assert.equal(probe.looksLikeHls, true);
  });
});
