// Measured contrast for the crash screen, not claimed contrast.
//
// Every pair below is a colour actually used by src/components/ErrorBoundary.jsx.
// Normal text must reach 4.5:1 and large text / component boundaries 3:1.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ERROR_THEME, contrastRatio } from "../errorTheme.js";

const T = ERROR_THEME;

describe("crash screen contrast", () => {
  test("headline and body text on the cream card clear 4.5:1", () => {
    const heading = contrastRatio(T.ink, T.surface);
    const body = contrastRatio(T.muted, T.surface);
    assert.ok(heading >= 4.5, `heading ${heading.toFixed(2)}:1`);
    assert.ok(body >= 4.5, `body ${body.toFixed(2)}:1`);
  });

  test("the technical details panel text clears 4.5:1", () => {
    const detail = contrastRatio(T.ink, T.sunken);
    const summary = contrastRatio(T.muted, T.sunken);
    assert.ok(detail >= 4.5, `detail ${detail.toFixed(2)}:1`);
    assert.ok(summary >= 4.5, `summary ${summary.toFixed(2)}:1`);
  });

  test("the retry button label clears 4.5:1", () => {
    const label = contrastRatio(T.onPrimary, T.primary);
    assert.ok(label >= 4.5, `label ${label.toFixed(2)}:1`);
  });

  test("the card is distinguishable from the slate field (3:1 boundary)", () => {
    const boundary = contrastRatio(T.surface, T.field);
    assert.ok(boundary >= 3, `boundary ${boundary.toFixed(2)}:1`);
  });

  test("the focus ring is visible against the card (3:1)", () => {
    const ring = contrastRatio(T.field, T.surface);
    assert.ok(ring >= 3, `ring ${ring.toFixed(2)}:1`);
  });

  test("the ratios are computed correctly for a known pair", () => {
    // Black on white is the canonical 21:1.
    assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")), 21);
    assert.equal(Math.round(contrastRatio("#FFFFFF", "#FFFFFF")), 1);
  });
});