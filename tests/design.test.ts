import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampVisionGrid, parseFontScale, viewDesignPayload } from "../lib/agent/design";

describe("vision layout constraints", () => {
  it("clamps spans and rejects cells that leave the 4×3 board", () => {
    assert.deepEqual(clampVisionGrid({ col: 0, row: 0, colSpan: 2, rowSpan: 2 }), {
      col: 0,
      row: 0,
      colSpan: 2,
      rowSpan: 2,
    });
    assert.equal(clampVisionGrid({ col: 3, row: 0, colSpan: 2, rowSpan: 1 }), null);
    assert.equal(clampVisionGrid({ col: 0, row: 2, colSpan: 1, rowSpan: 2 }), null);
    assert.deepEqual(clampVisionGrid({ col: 2, row: 1, colSpan: 9, rowSpan: 9 }), {
      col: 2,
      row: 1,
      colSpan: 2,
      rowSpan: 2,
    });
  });

  it("accepts only sm|md|lg font scales", () => {
    assert.equal(parseFontScale("lg"), "lg");
    assert.equal(parseFontScale("huge", "sm"), "sm");
  });

  it("documents every rotating view for Grokbot", () => {
    const all = viewDesignPayload();
    assert.ok(all.views?.vision);
    assert.ok(all.views?.momente);
    assert.ok(all.views?.week);
    assert.ok(all.views?.today);
    assert.ok(all.views?.home);
    const vision = viewDesignPayload("vision");
    assert.equal(vision.view?.viewId, "vision");
    assert.equal(vision.view?.maxCards, 12);
  });
});
