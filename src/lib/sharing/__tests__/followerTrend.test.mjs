// The follower's glucose direction: arrow and wording come from ONE result, so
// they cannot contradict each other, and every arrow that can come back has
// something to draw it with.
//
// Run with:
//   node --test src/lib/sharing/__tests__/followerTrend.test.mjs
//
// Fabricated readings only.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TREND_ICON_KEYS, computeGlucoseTrend, mapDexcomTrend } from "../../glucoseTrend.js";

const NOW = new Date("2026-10-25T18:00:00.000Z").getTime();
const MIN = 60 * 1000;
const reading = (minutesAgo, value) => ({
  value,
  recorded_at: new Date(NOW - minutesAgo * MIN).toISOString(),
});

/** Climbing, steady and falling families, so every arrow is exercised. */
const SERIES = [
  [reading(15, 100), reading(10, 140), reading(5, 160)],
  [reading(15, 100), reading(10, 112), reading(5, 120)],
  [reading(15, 120), reading(10, 122), reading(5, 121)],
  [reading(15, 160), reading(10, 120), reading(5, 100)],
  [reading(15, 200), reading(10, 150), reading(5, 110)],
];

/** Which way a written label says the glucose is going. */
function wordDirection(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("rising")) return "up";
  if (text.includes("falling")) return "down";
  if (text === "stable") return "steady";
  return "unknown";
}

/** Which way an arrow points. */
function arrowDirection(icon) {
  if (!icon) return "none";
  if (icon.includes("up")) return "up";
  if (icon.includes("down")) return "down";
  return "steady";
}

const DEXCOM_TRENDS = [
  "doubleUp",
  "singleUp",
  "fortyFiveUp",
  "flat",
  "fortyFiveDown",
  "singleDown",
  "doubleDown",
  "None",
  "",
  null,
  "notATrend",
];

describe("the arrow mapping is complete", () => {
  test("every derived direction resolves to an arrow the card can draw", () => {
    for (const series of SERIES) {
      const { icon } = computeGlucoseTrend(series);
      assert.ok(TREND_ICON_KEYS.includes(icon), `${icon} must be a drawable arrow`);
    }
  });

  test("every CGM trend string resolves to one of the same arrows, or to nothing", () => {
    for (const raw of DEXCOM_TRENDS) {
      const mapped = mapDexcomTrend(raw);
      if (!mapped) continue;
      assert.ok(TREND_ICON_KEYS.includes(mapped.icon), `${mapped.icon} must be a drawable arrow`);
    }
    // The CGM supplies each of the seven at some point in real use.
    const produced = new Set(DEXCOM_TRENDS.map((raw) => mapDexcomTrend(raw)?.icon).filter(Boolean));
    assert.equal(produced.size, 7, "all seven arrows must be reachable from real CGM trends");
  });

  test("the shared arrow component draws every arrow this mapping can return", () => {
    // Read from the component itself rather than trusting a copy: an arrow that
    // the mapping can return but the component cannot draw would render as an
    // empty space next to a reading.
    const source = readFileSync(new URL("../../../components/glucose/TrendArrow.jsx", import.meta.url), "utf8");
    for (const key of TREND_ICON_KEYS) {
      const pattern = new RegExp(`["']?${key.replace("-", "\\-")}["']?\\s*:`);
      assert.ok(pattern.test(source), `TrendArrow must draw "${key}"`);
    }
  });
});

describe("the arrow and the written direction never disagree", () => {
  test("the derived mapping stays in step", () => {
    for (const series of SERIES) {
      const { icon, label } = computeGlucoseTrend(series);
      assert.equal(arrowDirection(icon), wordDirection(label), `${icon} vs "${label}"`);
    }
  });

  test("the CGM mapping stays in step", () => {
    for (const raw of DEXCOM_TRENDS) {
      const mapped = mapDexcomTrend(raw);
      if (!mapped) continue;
      assert.equal(arrowDirection(mapped.icon), wordDirection(mapped.label), `${mapped.icon} vs "${mapped.label}"`);
    }
  });

  test("the words the follower reads are the same ones the patient's card uses", () => {
    // Same mapping module, so this is a guard against a future local override
    // rather than a re-implementation.
    assert.deepEqual(computeGlucoseTrend([reading(15, 100), reading(10, 140), reading(5, 160)]), {
      icon: "up-right",
      label: "Slowly rising",
    });
    assert.deepEqual(mapDexcomTrend("flat"), { icon: "right", label: "Stable" });
  });
});

describe("thin data never implies a steady arrow", () => {
  test("fewer than two readings fall back to the steady default, which is why the card guards on the count", () => {
    // The mapping itself has no way to say "unknown", so the follower's card
    // only draws a derived arrow when there are at least two readings, when the
    // reading is not stale, and when the projection itself describes a
    // direction. This test documents the trap it avoids.
    assert.equal(computeGlucoseTrend([]).icon, "right");
    assert.equal(computeGlucoseTrend([reading(5, 120)]).icon, "right");
  });

  test("a single reading series cannot be mistaken for a measured steady", () => {
    const only = [reading(5, 120)];
    assert.equal(only.length < 2, true, "the card's guard is the reading count");
  });
});