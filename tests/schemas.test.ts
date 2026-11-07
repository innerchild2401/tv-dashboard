import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleConfig } from "../lib/seed/sample-config";
import { cardSchema, configSchema } from "../lib/schemas";

const cardBase = {
  id: "66666666-6666-4666-8666-666666666601",
  viewId: "vision",
  color: "mint" as const,
  tilt: 1,
  grid: { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
  pinned: false,
  source: "assistant" as const,
  locked: false,
};

describe("schemas", () => {
  it("accepts the sample config", () => {
    assert.equal(configSchema.parse(sampleConfig).location.name, "Constanța");
  });

  it("refuses a win without evidence and a raw hex color", () => {
    const missingEvidence = cardSchema.safeParse({
      ...cardBase,
      kind: "wins",
      data: { items: [{ text: "Am închis taskul" }] },
    });
    assert.equal(missingEvidence.success, false);

    const hex = cardSchema.safeParse({
      ...cardBase,
      kind: "affirmation",
      color: "#FFD166",
      data: {},
    });
    assert.equal(hex.success, false);
  });

  it("accepts a progress card that names its evidence", () => {
    const parsed = cardSchema.parse({
      ...cardBase,
      kind: "progress",
      data: {
        label: "Pachet",
        value: 0,
        max: 1,
        style: "bar",
        evidence: "task:done:11111111-1111-4111-8111-111111111111",
      },
    });
    assert.equal(parsed.kind, "progress");
  });
});
