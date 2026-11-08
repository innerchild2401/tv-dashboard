import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TV_SAFE_FRACTION, tvFitScale } from "@/lib/tv/fit";

describe("tvFitScale", () => {
  it("scales 1280×720 to 1.5 on a full 1920×1080 panel without safe inset", () => {
    assert.equal(tvFitScale(1920, 1080, 1), 1.5);
  });

  it("keeps a uniform 1.35× letterbox inside the Cast 10% safe area on 1080p", () => {
    assert.equal(tvFitScale(1920, 1080), 1.35);
    assert.equal(TV_SAFE_FRACTION, 0.9);
  });

  it("fits classic Cast 1280×720 browser without overflowing", () => {
    assert.equal(tvFitScale(1280, 720, 1), 1);
    assert.equal(tvFitScale(1280, 720), 0.9);
  });

  it("letterboxes non-16:9 viewports instead of stretching", () => {
    assert.equal(tvFitScale(1920, 1200, 1), 1.5);
    assert.equal(tvFitScale(1600, 1080, 1), 1.25);
  });
});
