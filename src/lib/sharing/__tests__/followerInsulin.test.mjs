// What the follower's active-insulin view is built from.
//
// Run with:
//   node --test src/lib/sharing/__tests__/followerInsulin.test.mjs
//
// Fabricated doses only — no health records are read or written. These fixtures
// pin the rules the follower sees: which doses count as still acting (including
// a basal dose older than 24 hours), which are left out, and when the figure is
// withheld rather than reported as a misleading zero.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { activeInsulinDoses, computeSharedActiveInsulin, sharedBasalSummary } from "../followerInsulin.js";

const NOW = new Date("2026-10-25T18:00:00.000Z").getTime();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const at = (hoursAgo) => new Date(NOW - hoursAgo * HOUR).toISOString();
const dose = (insulin_type, units, hoursAgo) => ({ insulin_type, units, administered_at: at(hoursAgo) });

describe("which doses are still acting", () => {
  test("a rapid-acting dose inside its action is included", () => {
    const [active] = activeInsulinDoses([dose("NovoLog", 6, 2)], NOW);
    assert.equal(active.insulin_type, "NovoLog");
    assert.equal(active.units, 6);
    assert.equal(active.is_rapid, true);
    assert.equal(active.is_basal, false);
    assert.ok(active.stage, "the engine's own stage must be carried through");
    assert.ok(active.progress > 0 && active.progress < 1);
    assert.ok(active.remaining_minutes > 0);
    assert.ok(active.remaining_label);
  });

  test("a long-acting basal dose logged more than a day ago is still acting, and is included", () => {
    // 26 hours into an ultra-long-acting basal's own action — the case a rolling
    // 24 hour window would have dropped entirely.
    const [active] = activeInsulinDoses([dose("Tresiba", 20, 26)], NOW);
    assert.ok(active, "a basal dose older than 24 hours must still be visible while it acts");
    assert.equal(active.is_basal, true);
    assert.equal(active.is_rapid, false);
    assert.ok(active.remaining_minutes > 0);
  });

  test("a dose whose own action has finished is excluded, whatever its type", () => {
    assert.deepEqual(activeInsulinDoses([dose("NovoLog", 6, 8)], NOW), []);
    assert.deepEqual(activeInsulinDoses([dose("Tresiba", 20, 45)], NOW), [], "past its 42 hour action");
    assert.deepEqual(activeInsulinDoses([dose("Lantus", 18, 25)], NOW), [], "past its 24 hour action");
  });

  test("a premixed product keeps its stage but is never given a countdown", () => {
    const [premix] = activeInsulinDoses([dose("Humalog Mix 75/25", 10, 1)], NOW);
    assert.ok(premix, "a premix dose inside its action is still shown");
    assert.ok(premix.stage);
    assert.equal(premix.remaining_minutes, null);
    assert.equal(premix.remaining_label, null);
  });

  test("a dose dated in the future is not active yet", () => {
    assert.deepEqual(activeInsulinDoses([dose("NovoLog", 6, -1)], NOW), []);
  });

  test("a dose with no usable amount or time is left out, never modelled as nothing", () => {
    assert.deepEqual(activeInsulinDoses([{ insulin_type: "NovoLog", units: null, administered_at: at(1) }], NOW), []);
    assert.deepEqual(activeInsulinDoses([{ insulin_type: "NovoLog", units: 0, administered_at: at(1) }], NOW), []);
    assert.deepEqual(activeInsulinDoses([{ insulin_type: "NovoLog", units: 6, administered_at: null }], NOW), []);
    assert.deepEqual(activeInsulinDoses([{ insulin_type: "NovoLog", administered_at: at(1) }], NOW), []);
  });

  test("a product the engine does not recognise is refused, never guessed at", () => {
    assert.deepEqual(activeInsulinDoses([{ insulin_type: "Mystery Insulin", units: 5, administered_at: at(1) }], NOW), []);
  });

  test("the most recent dose comes first", () => {
    const active = activeInsulinDoses([dose("NovoLog", 8, 2), dose("Humalog", 10, 1)], NOW);
    assert.deepEqual(active.map((d) => d.insulin_type), ["Humalog", "NovoLog"]);
  });

  test("a small dose clears earlier than a large one — the engine's own tiered rule, not a fixed day", () => {
    // The patient model tiers DIA by dose size, so a 3 u dose can be fully
    // cleared while a 12 u one logged at the same moment is still acting. The
    // follower's view inherits that instead of assuming every dose lasts the
    // same time.
    const active = activeInsulinDoses([dose("NovoLog", 3, 2), dose("NovoLog", 12, 2)], NOW);
    assert.deepEqual(active.map((d) => d.units), [12]);
  });

  test("an empty or malformed list yields nothing rather than throwing", () => {
    assert.deepEqual(activeInsulinDoses([], NOW), []);
    assert.deepEqual(activeInsulinDoses(null, NOW), []);
    assert.deepEqual(activeInsulinDoses([null, undefined], NOW), []);
  });
});

describe("the estimated active rapid-acting figure", () => {
  test("an unconfirmed plan is Unavailable — never a number", () => {
    const r = computeSharedActiveInsulin([dose("NovoLog", 6, 2)], NOW, { doseMathAvailable: false });
    assert.equal(r.available, false);
    assert.equal(r.reason, "unconfirmed_plan");
    assert.equal(r.value, null);
  });

  test("an active rapid-acting dose produces a positive figure", () => {
    const r = computeSharedActiveInsulin([dose("NovoLog", 8, 1)], NOW, { doseMathAvailable: true });
    assert.equal(r.available, true);
    assert.ok(r.value > 0);
    assert.equal(r.isZero, false);
  });

  test("basal alone is Unavailable, not 'none active' — basal is never counted as rapid", () => {
    const r = computeSharedActiveInsulin([dose("Tresiba", 20, 20)], NOW, { doseMathAvailable: true });
    assert.equal(r.available, false);
    assert.equal(r.reason, "no_rapid_doses");
    assert.equal(r.value, null);
  });

  test("rapid-acting doses that have all cleared read as a genuine zero", () => {
    const r = computeSharedActiveInsulin([dose("NovoLog", 3, 12)], NOW, { doseMathAvailable: true });
    assert.equal(r.available, true);
    assert.equal(r.isZero, true);
    assert.equal(r.value, 0);
  });

  test("an unrecognised product withholds the total instead of undercounting it", () => {
    const r = computeSharedActiveInsulin(
      [dose("NovoLog", 6, 1), { insulin_type: "Mystery Insulin", units: 5, administered_at: at(1) }],
      NOW,
      { doseMathAvailable: true }
    );
    assert.equal(r.available, false);
    assert.equal(r.reason, "unknown_type");
  });

  test("an empty list is Unavailable, never 0.0 u", () => {
    const r = computeSharedActiveInsulin([], NOW, { doseMathAvailable: true });
    assert.equal(r.available, false);
    assert.equal(r.value, null);
  });
});

describe("basal, described separately and without units", () => {
  test("a current basal dose is described in words", () => {
    const basal = sharedBasalSummary([dose("Lantus", 18, 6)], NOW);
    assert.ok(basal, "a current basal dose must be described");
    assert.ok(basal.label);
    assert.equal(/\d/.test(basal.label), false, "basal is a coverage state, never a number of units");
  });

  test("with no basal logged nothing is claimed at all", () => {
    assert.equal(sharedBasalSummary([], NOW), null);
    assert.equal(sharedBasalSummary([dose("NovoLog", 6, 1)], NOW), null);
    assert.equal(sharedBasalSummary(null, NOW), null);
  });

  test("basal never contributes to the rapid-acting total", () => {
    const rapidOnly = computeSharedActiveInsulin([dose("NovoLog", 6, 1)], NOW, { doseMathAvailable: true });
    const withBasal = computeSharedActiveInsulin([dose("NovoLog", 6, 1), dose("Lantus", 18, 6)], NOW, {
      doseMathAvailable: true,
    });
    assert.equal(withBasal.value, rapidOnly.value);
  });
});