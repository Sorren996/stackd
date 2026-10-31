import { describe, it, expect } from "vitest";
import {
  CONTENT_TOP_GAP_PX,
  CONTENT_TOP_PADDING,
  CONTENT_TOP_PX,
  HEADER_BAR_BOTTOM,
  HEADER_BAR_PX,
  HEADER_BLUR_HEIGHT,
  HEADER_BLUR_TAIL_PX,
} from "../layoutMetrics";

// The bug this guards: the blur's reach and the content's top clearance were
// separate numbers, so the first card drifted into the blur zone. These checks
// fail the moment the blur footprint grows past the clearance.

// Reads the px the safe-area expression adds, whatever wrapper it sits in
// (`calc(env(...) + 76px)`), so the strings and the numbers are compared
// against each other rather than to a second hardcoded copy.
function pxFrom(css) {
  const match = /env\(safe-area-inset-top\)\s*\+\s*(\d+)px/.exec(css.replace(/\s+/g, " "));
  return match ? Number(match[1]) : NaN;
}

describe("shared layout metrics — content clears the header blur", () => {
  it("reserves the bar, the blur tail and a gap", () => {
    expect(CONTENT_TOP_PX).toBe(HEADER_BAR_PX + HEADER_BLUR_TAIL_PX + CONTENT_TOP_GAP_PX);
  });

  it("starts content strictly below where the blur reaches zero", () => {
    const blurEnd = HEADER_BAR_PX + HEADER_BLUR_TAIL_PX;
    expect(CONTENT_TOP_PX).toBeGreaterThan(blurEnd);
    // A visible, intentional gap rather than a hairline.
    expect(CONTENT_TOP_PX - blurEnd).toBeGreaterThanOrEqual(12);
  });

  it("keeps the blur effect's own height equal to the bar plus its tail", () => {
    expect(pxFrom(HEADER_BLUR_HEIGHT)).toBe(HEADER_BAR_PX + HEADER_BLUR_TAIL_PX);
  });

  it("keeps the content padding equal to the full clearance", () => {
    expect(pxFrom(CONTENT_TOP_PADDING)).toBe(CONTENT_TOP_PX);
  });

  it("anchors the pull-to-refresh spinner on the bar's own bottom edge", () => {
    expect(HEADER_BAR_BOTTOM).toContain(`${HEADER_BAR_PX}px`);
  });
});