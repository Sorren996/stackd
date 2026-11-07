/**
 * Guards the public/auth safe-area contract.
 *
 * These are unit tests of the shipped values and wiring — they prove the shells
 * read ONE shared, env()-based basis and that nothing in it is a hardcoded
 * device height. They cannot prove what iOS actually draws; that needs a
 * physical build (see the report's remaining checks).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as safe from "../safeArea.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const GEOMETRY = {
  PUBLIC_HEADER_PAD_TOP: safe.PUBLIC_HEADER_PAD_TOP,
  PUBLIC_HEADER_EDGE_LEFT: safe.PUBLIC_HEADER_EDGE_LEFT,
  PUBLIC_HEADER_EDGE_RIGHT: safe.PUBLIC_HEADER_EDGE_RIGHT,
  PUBLIC_FOOTER_PAD_BOTTOM: safe.PUBLIC_FOOTER_PAD_BOTTOM,
  AUTH_PAGE_PAD_TOP: safe.AUTH_PAGE_PAD_TOP,
  AUTH_PAGE_PAD_BOTTOM: safe.AUTH_PAGE_PAD_BOTTOM,
  AUTH_PAGE_PAD_SIDE_LEFT: safe.AUTH_PAGE_PAD_SIDE_LEFT,
  AUTH_PAGE_PAD_SIDE_RIGHT: safe.AUTH_PAGE_PAD_SIDE_RIGHT,
  MFA_PAGE_PAD_TOP: safe.MFA_PAGE_PAD_TOP,
  MFA_PAGE_PAD_BOTTOM: safe.MFA_PAGE_PAD_BOTTOM,
  SKIP_LINK_TOP: safe.SKIP_LINK_TOP,
  SKIP_LINK_LEFT: safe.SKIP_LINK_LEFT,
};

test("every shell offset is derived from an OS inset, never a device number", () => {
  for (const [name, value] of Object.entries(GEOMETRY)) {
    assert.match(value, /env\(safe-area-inset-/, `${name} must read env()`);
    // A bare pixel figure (44px, 59px, 88px …) would be an iPhone guess.
    assert.doesNotMatch(value, /^(?:\d+)px$/, `${name} must not be a fixed pixel height`);
  }
});

test("the top offsets are reserve-plus-air, so the strip is never covered by content", () => {
  assert.equal(safe.PUBLIC_HEADER_PAD_TOP, "env(safe-area-inset-top)");
  assert.match(safe.AUTH_PAGE_PAD_TOP, /^calc\(env\(safe-area-inset-top\) \+ \d/);
  assert.match(safe.AUTH_PAGE_PAD_BOTTOM, /^calc\(env\(safe-area-inset-bottom\) \+ \d/);
  assert.match(safe.PUBLIC_FOOTER_PAD_BOTTOM, /^calc\(env\(safe-area-inset-bottom\) \+ \d/);
  assert.match(safe.SKIP_LINK_TOP, /^calc\(env\(safe-area-inset-top\) \+ \d/);
});

test("side padding keeps a landscape cut-out off the card", () => {
  assert.match(safe.AUTH_PAGE_PAD_SIDE_LEFT, /^max\(\d+rem, env\(safe-area-inset-left\)\)$/);
  assert.match(safe.AUTH_PAGE_PAD_SIDE_RIGHT, /^max\(\d+rem, env\(safe-area-inset-right\)\)$/);
});

test("the module documents the zero-inset truth instead of inventing a fallback", () => {
  const source = read("../safeArea.js");
  assert.match(source, /SAFE_INSET_ZERO/);
  assert.match(source, /no inset bridge/i);
  assert.match(source, /hardcoded|invent a number/i);
});

test("the public shells read their offsets from the contract", () => {
  const nav = read("../../components/public/PublicNav.jsx");
  assert.match(nav, /PUBLIC_HEADER_PAD_TOP/);
  // The status strip must be painted with a solid colour, not a translucent
  // wash that shows page content beside the clock.
  assert.match(nav, /var\(--site-field\)/);
  assert.doesNotMatch(nav, /backdropFilter/, "the public header band must be opaque");

  const footer = read("../../components/public/PublicFooter.jsx");
  assert.match(footer, /PUBLIC_FOOTER_PAD_BOTTOM/);

  const shell = read("../../components/public/PublicShell.jsx");
  assert.match(shell, /skip-link/);
});

test("the account screens reserve AND paint the status strip", () => {
  const layout = read("../../components/AuthLayout.jsx");
  assert.match(layout, /AUTH_PAGE_PAD_TOP/);
  assert.match(layout, /AUTH_PAGE_PAD_BOTTOM/);
  assert.match(layout, /SafeAreaBand/);
  assert.match(layout, /auth-surface/);
  assert.match(layout, /skip-link/);

  const band = read("../../components/SafeAreaBand.jsx");
  assert.match(band, /SAFE_TOP/);
  assert.match(band, /pointerEvents: "none"/);
  assert.match(band, /aria-hidden/);
});

test("the MFA page uses the same contract", () => {
  const parts = read("../../components/MfaParts.jsx");
  assert.match(parts, /MFA_PAGE_PAD_TOP/);
  assert.match(parts, /MFA_PAGE_PAD_BOTTOM/);
});

test("the document is actually allowed to paint edge to edge", () => {
  const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
  assert.match(html, /viewport-fit=cover/);
});