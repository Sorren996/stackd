import { describe, it, expect } from "vitest";
import { shouldAnchorToLatest, ANCHOR_TOLERANCE_PX } from "../graphAnchor";

// The bug this guards: after a resume (or any remount of the scroll container)
// the marker stayed on an old position — or on the oldest reading — instead of
// the newest received one, while browsing older history had to stay untouched.

describe("graph anchor decision", () => {
  it("anchors on resume even when the reader had scrolled into history", () => {
    expect(shouldAnchorToLatest({ resumed: true, freshViewport: false, previousNowPosition: 900, scrollLeft: 120 })).toBe(true);
  });

  it("anchors when the scroll container has just mounted at offset 0", () => {
    expect(shouldAnchorToLatest({ resumed: false, freshViewport: true, previousNowPosition: 900, scrollLeft: 0 })).toBe(true);
  });

  it("anchors on the very first pass, before any position is known", () => {
    expect(shouldAnchorToLatest({ resumed: false, freshViewport: false, previousNowPosition: null, scrollLeft: 0 })).toBe(true);
  });

  it("follows new samples while the reader is at the latest position", () => {
    expect(shouldAnchorToLatest({ resumed: false, freshViewport: false, previousNowPosition: 900, scrollLeft: 900 })).toBe(true);
  });

  it("accepts sub-pixel drift against the recorded position", () => {
    expect(shouldAnchorToLatest({ resumed: false, freshViewport: false, previousNowPosition: 900, scrollLeft: 900 - ANCHOR_TOLERANCE_PX })).toBe(true);
  });

  it("never steals a deliberate browse into older history", () => {
    expect(shouldAnchorToLatest({ resumed: false, freshViewport: false, previousNowPosition: 900, scrollLeft: 400 })).toBe(false);
  });

  it("ignores a non-finite scroll offset instead of jumping on every render", () => {
    expect(shouldAnchorToLatest({ resumed: false, freshViewport: false, previousNowPosition: 900, scrollLeft: undefined })).toBe(false);
  });
});