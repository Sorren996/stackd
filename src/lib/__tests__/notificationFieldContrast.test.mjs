import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTROL,
  fieldStyle,
  mutedStyle,
  primaryStyle,
  secondaryStyle,
  switchThumbClass,
  switchTrackClass,
} from "../notifications/notificationFieldTheme.js";

function luminance(hex) {
  const value = hex.replace("#", "");
  const channel = (index) => {
    const srgb = parseInt(value.slice(index, index + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function ratio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// The page's cards are cream in light and dark mode alike, so its controls must
// be painted from fixed values. A theme token here would flip to the dark slate
// and leave the value, unit and carets dark-on-dark on a cream card.
test("the page's controls use fixed colours, not theme tokens", () => {
  const painted = [CONTROL.fill, CONTROL.ink, CONTROL.hairline, CONTROL.muted, CONTROL.rust];
  for (const value of painted) {
    assert.match(value, /^#[0-9A-Fa-f]{6}$|^rgba?\(/, `not a fixed colour: ${value}`);
  }
  assert.deepEqual(
    [fieldStyle.background, fieldStyle.color, primaryStyle.background, primaryStyle.color, secondaryStyle.color],
    [CONTROL.fill, CONTROL.ink, CONTROL.rust, CONTROL.fill, CONTROL.ink]
  );
  assert.equal(fieldStyle.colorScheme, "light", "native steppers and select lists stay light on the cream field");
  for (const classes of [switchTrackClass, switchThumbClass]) {
    assert.ok(!classes.includes("var(--"), "the switch carries no theme token");
  }
});

test("a value, a label and a caret read strongly on the field", () => {
  // 16px ink numerals and the label both sit on the cream fill.
  assert.ok(ratio(CONTROL.ink, CONTROL.fill) >= 7, "ink on cream must clear AAA");
  assert.ok(ratio(CONTROL.ink, CONTROL.fill) > ratio("#3F3830", CONTROL.fill), "the value is deeper than the old ink");
});

test("the unit and the helper line stay legible beneath the value", () => {
  // Supporting tier, deliberately lighter than the value it belongs to.
  assert.ok(ratio(mutedStyle.color, CONTROL.fill) >= 3);
  assert.ok(ratio(mutedStyle.color, CONTROL.fill) > 1);
});

test("primary and secondary buttons never put a dark label on a dark fill", () => {
  assert.ok(ratio(primaryStyle.color, primaryStyle.background) >= 4.5, "cream on rust");
  assert.ok(ratio(secondaryStyle.color, secondaryStyle.background) >= 7, "ink on cream");
  // The old pairing: espresso ink on the theme background, which turns black.
  assert.ok(ratio("#3F3830", "#191D23") < 2, "the removed pairing really was dark-on-dark");
});

test("the switch track and thumb stay distinguishable in both states", () => {
  // Off: muted thumb on the cream track. On: cream thumb on rust.
  assert.ok(ratio(CONTROL.muted, CONTROL.fill) >= 3);
  assert.ok(ratio(CONTROL.fill, CONTROL.rust) >= 4.5);
});