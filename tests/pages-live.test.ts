import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryStore } from "../lib/agent/memory";
import { executeTool } from "../lib/agent/tools";
import { viewDesignPayload } from "../lib/agent/design";
import { LIVE_VIEW_ID } from "../i18n/ro";
import { buildTvState } from "../lib/state/build";
import { sampleSnapshot } from "../lib/state/sample";
import { celebrationDay } from "../i18n/ro";

describe("custom pages and antena3 live", () => {
  it("documents page and live design contracts", () => {
    const pages = viewDesignPayload("custom-page");
    assert.equal(pages.view?.viewId, "custom-page");
    const live = viewDesignPayload("antena3");
    assert.equal(live.view?.viewId, "antena3");
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

    const stop = await executeTool("stop_antena3_live", {}, { store, now });
    assert.equal(stop.ok, true);
    assert.equal((await store.control()).mode, "rotate");
  });

  it("formats celebration without Aniversare azi: Aniversare", () => {
    assert.equal(celebrationDay("Aniversare"), null);
    assert.equal(celebrationDay("Ziua de naștere Zian"), "Aniversare azi: Zian");
  });
});
