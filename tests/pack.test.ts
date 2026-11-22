import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packVisionCards, visionCellsOverlap } from "../lib/views/pack";
import { suggestVisionPresentation } from "../lib/agent/layout";
import { MemoryStore } from "../lib/agent/memory";
import { executeTool, TOOL_CATALOG } from "../lib/agent/tools";
import { TOOL_NAMES } from "../lib/agent/model";
import { projectVision } from "../lib/views/household";
import { sampleSnapshot } from "../lib/state/sample";

describe("Victorii packing", () => {
  it("resolves overlapping quote and wins into non-overlapping cells", () => {
    const packed = packVisionCards([
      { id: "quote", col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { id: "zian", col: 0, row: 1, colSpan: 2, rowSpan: 2 },
      { id: "vac", col: 3, row: 0, colSpan: 1, rowSpan: 1 },
    ]);
    assert.equal(packed.length, 3);
    for (let i = 0; i < packed.length; i += 1) {
      for (let j = i + 1; j < packed.length; j += 1) {
        assert.equal(visionCellsOverlap(packed[i]!, packed[j]!), false);
      }
    }
    const quote = packed.find((card) => card.id === "quote");
    const zian = packed.find((card) => card.id === "zian");
    assert.deepEqual(quote, { id: "quote", col: 0, row: 0, colSpan: 2, rowSpan: 2 });
    assert.ok(zian);
    assert.equal(zian.colSpan, 2);
  });

  it("hides data.hidden cards and packs the rest on projectVision", () => {
    const now = new Date("2026-11-18T12:00:00.000Z");
    const snapshot = sampleSnapshot(now);
    snapshot.cards[0]!.grid = { col: 0, row: 0, colSpan: 2, rowSpan: 2 };
    snapshot.cards[4]!.grid = { col: 0, row: 0, colSpan: 2, rowSpan: 2 };
    snapshot.cards[4]!.data = { ...snapshot.cards[4]!.data, hidden: true };
    const vision = projectVision(snapshot, now, "Aniversare azi");
    assert.equal(vision.celebration, null);
    assert.equal(vision.cards.some((card) => card.id === snapshot.cards[4]!.id), false);
    for (let i = 0; i < vision.cards.length; i += 1) {
      for (let j = i + 1; j < vision.cards.length; j += 1) {
        assert.equal(visionCellsOverlap(vision.cards[i]!, vision.cards[j]!), false);
      }
    }
  });
});

describe("layout sizing + MCP tools", () => {
  it("suggests larger spans for long affirmations and compact wins", () => {
    assert.deepEqual(
      suggestVisionPresentation({
        kind: "affirmation",
        title: "Efeseni 5:22",
        body: "Supuneți-vă unii altora în frica lui Hristos.",
      }).colSpan,
      2,
    );
    assert.equal(suggestVisionPresentation({ kind: "wins", title: "Bravo, Zian!", body: "Ok" }).fontScale, "lg");
  });

  it("registers preview/publish and pages/live tools on the MCP catalog", () => {
    for (const name of [
      "preview_layout",
      "publish_layout",
      "upsert_page",
      "delete_page",
      "start_live_channel",
      "stop_live_channel",
      "start_antena3_live",
      "stop_antena3_live",
    ]) {
      assert.ok((TOOL_NAMES as readonly string[]).includes(name));
      assert.ok(TOOL_CATALOG.some((tool) => tool.name === name));
    }
  });

  it("previews a draft layout then publishes it", async () => {
    const store = new MemoryStore();
    await executeTool(
      "upsert_card",
      {
        externalId: "quote-test",
        kind: "affirmation",
        title: "Efeseni 5:22",
        body: "Text scurt",
        grid: { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      },
      { store },
    );
    await executeTool(
      "upsert_card",
      {
        externalId: "zian-test",
        kind: "wins",
        title: "Bravo, Zian!",
        body: "Premiu",
        data: { items: [{ text: "Premiu", evidence: "manual:test" }] },
        grid: { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      },
      { store },
    );
    const preview = await executeTool(
      "preview_layout",
      {
        cards: [
          { externalId: "quote-test", grid: { col: 0, row: 0, colSpan: 2, rowSpan: 2 } },
          { externalId: "zian-test", grid: { col: 2, row: 1, colSpan: 1, rowSpan: 1 } },
        ],
      },
      { store },
    );
    assert.equal(preview.ok, true);
    assert.match(preview.previewUrl ?? "", /\/api\/preview\/vision\/.+\.png$/);

    const published = await executeTool("publish_layout", {}, { store });
    assert.equal(published.ok, true);
    const cards = await store.cards();
    const zian = cards.find((card) => card.externalId === "zian-test");
    assert.equal(zian?.gridCol, 2);
    assert.equal(zian?.gridRow, 1);
  });
});
