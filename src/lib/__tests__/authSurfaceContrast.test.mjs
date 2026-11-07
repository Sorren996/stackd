/**
 * Measures the account-screen palette that ships in src/index.css.
 *
 * The colours are read out of the stylesheet itself, so this test fails if a
 * value is ever changed to one that no longer meets WCAG AA on the cream card.
 * Thresholds: 4.5:1 for normal text, 3:1 for a control boundary.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

const token = (name) => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  assert.ok(match, `--${name} must be defined in index.css`);
  return match[1].toLowerCase();
};

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const h = hex.replace("#", "");
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  );
};

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const CARD = "#fdf9f2";

test("the card's own text tokens pass AA against the cream card", () => {
  const pairs = [
    ["--auth-ink", token("auth-ink"), CARD, 4.5],
    ["--auth-muted", token("auth-muted"), CARD, 4.5],
    ["--auth-link", token("auth-link"), CARD, 4.5],
  ];
  for (const [name, colour, background, min] of pairs) {
    const measured = ratio(colour, background);
    assert.ok(measured >= min, `${name} ${colour} on ${background} is ${measured.toFixed(2)}:1`);
  }
});

test("the in-card error message stays readable on its own tint", () => {
  const measured = ratio(token("auth-error"), token("auth-error-bg"));
  assert.ok(measured >= 4.5, `error text is ${measured.toFixed(2)}:1`);
});

test("the deletion-notice surface carries ink and secondary copy", () => {
  const ink = ratio(token("auth-ink"), token("auth-notice-bg"));
  const muted = ratio(token("auth-muted"), token("auth-notice-bg"));
  assert.ok(ink >= 4.5, `notice heading is ${ink.toFixed(2)}:1`);
  assert.ok(muted >= 4.5, `notice body is ${muted.toFixed(2)}:1`);
});

test("a field boundary is identifiable without relying on a shadow", () => {
  const measured = ratio(token("auth-control-border"), CARD);
  assert.ok(measured >= 3, `control border is ${measured.toFixed(2)}:1 against the card`);
});

test("cream on the slate field keeps its contrast, in both shells", () => {
  const field = token("site-field");
  const onField = ratio("#fdf9f2", field);
  const mist = ratio("#dde5e8", field);
  assert.ok(onField >= 4.5, `cream on field is ${onField.toFixed(2)}:1`);
  assert.ok(mist >= 4.5, `secondary cream on field is ${mist.toFixed(2)}:1`);
});

test("the card never inherits the field's pale foreground", () => {
  const block = /\.auth-surface\s*\{[^}]*\}/.exec(css);
  assert.ok(block, ".auth-surface must be defined");
  assert.match(block[0], /color:\s*var\(--auth-ink\)/);
  assert.match(block[0], /background-color:\s*var\(--auth-card\)/);
});