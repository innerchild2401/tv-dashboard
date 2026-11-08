/** Authoring canvas for /tv (spec: design 1280×720). */
export const TV_DESIGN_WIDTH = 1280;
export const TV_DESIGN_HEIGHT = 720;

/**
 * Google Cast UX asks for ~10% margin from panel edges for TV overscan.
 * Fit the design canvas inside this fraction of the browser viewport and
 * letterbox the rest (uniform scale — never stretch).
 */
export const TV_SAFE_FRACTION = 0.9;

/** Uniform scale so 1280×720 fits the safe viewport (1.5 on a full 1920×1080 panel). */
export function tvFitScale(
  viewportWidth: number,
  viewportHeight: number,
  safeFraction: number = TV_SAFE_FRACTION,
): number {
  const width = Math.max(1, viewportWidth) * safeFraction;
  const height = Math.max(1, viewportHeight) * safeFraction;
  return Math.min(width / TV_DESIGN_WIDTH, height / TV_DESIGN_HEIGHT);
}
