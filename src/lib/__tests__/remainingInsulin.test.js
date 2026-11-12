import { describe, it, expect } from "vitest";
import {
  formatRemaining,
  formatRemainingLong,
  formatRemainingValue,
  isModelZero,
  modelRemaining,
  REMAINING_ESTIMATE_NOTE,
} from "../remainingInsulin";
import { describeActiveInsulinEstimate, describeActiveInsulinLabel } from "../sharing/insulinEstimateGate";

// The rule under test: a POSITIVE modelled remainder below 1u is displayed as
// "1u", never as a fraction and never as a premature zero. Only the model's own
// endpoint reads 0. Display formatting must never mutate the amount.

describe("remaining-insulin presentation", () => {
  it("shows 1u for every positive remainder below one unit", () => {
    for (const value of [0.00001, 0.01, 0.06, 0.3, 0.49, 0.5, 0.94, 0.999]) {
      expect(formatRemainingValue(value)).toBe("1");
      expect(formatRemaining(value)).toBe("1u");
      expect(formatRemainingLong(value)).toBe("1u remaining");
    }
  });

  it("shows 0u only at the model endpoint, including exact zero", () => {
    expect(formatRemainingValue(0)).toBe("0");
    expect(formatRemaining(0)).toBe("0u");
    expect(isModelZero(0)).toBe(true);
    expect(isModelZero(0.00001)).toBe(false);
  });

  it("keeps existing one-decimal formatting at and above 1u", () => {
    expect(formatRemainingValue(1)).toBe("1.0");
    expect(formatRemainingValue(1.24)).toBe("1.2");
    expect(formatRemainingValue(3.06)).toBe("3.1");
    expect(formatRemaining(12)).toBe("12.0u");
  });

  it("never mutates the modelled amount for display", () => {
    expect(modelRemaining(0.42)).toBe(0.42);
    expect(modelRemaining(3.06)).toBe(3.06);
  });

  it("treats non-finite and negative input as model zero, not as a reading", () => {
    expect(formatRemainingValue(Number.NaN)).toBe("0");
    expect(formatRemainingValue(undefined)).toBe("0");
    expect(formatRemainingValue(-2)).toBe("0");
  });

  it("sums RAW remainders and formats only the total", () => {
    // Two 0.6u doses each display "1u"; the total must be the raw 1.2u, not 2u.
    const doses = [0.6, 0.6];
    expect(doses.map(formatRemainingValue)).toEqual(["1", "1"]);
    const rawTotal = doses.reduce((sum, d) => sum + d, 0);
    expect(formatRemainingValue(rawTotal)).toBe("1.2");
  });

  it("offers the quiet explanatory copy", () => {
    expect(REMAINING_ESTIMATE_NOTE).toBe(
      "Amounts below 1u are shown as 1u. Calculations retain the modeled amount."
    );
  });
});

describe("follower estimate gate — settings, authorization and zero", () => {
  it("reports unavailable while the sharer's plan is unconfirmed", () => {
    const gate = describeActiveInsulinEstimate(0.3, false, 1);
    expect(gate.available).toBe(false);
    expect(gate.reason).toBe("unconfirmed_plan");
    expect(gate.value).toBeNull();
  });

  it("reports unavailable when no rapid doses were visible", () => {
    const gate = describeActiveInsulinEstimate(1.2, true, 0);
    expect(gate.available).toBe(false);
    expect(gate.reason).toBe("no_rapid_doses");
  });

  it("reports unavailable for a non-computable figure", () => {
    expect(describeActiveInsulinEstimate(null, true, 1).available).toBe(false);
    expect(describeActiveInsulinEstimate(Number.NaN, true, 1).reason).toBe("not_computable");
    expect(describeActiveInsulinEstimate(-1, true, 1).reason).toBe("not_computable");
  });

  it("keeps a small positive remainder as positive, unrounded", () => {
    const gate = describeActiveInsulinEstimate(0.04, true, 1);
    expect(gate.available).toBe(true);
    expect(gate.value).toBe(0.04);
    expect(gate.isZero).toBe(false);
    expect(formatRemainingValue(gate.value)).toBe("1");
  });

  it("reports zero only at the model endpoint", () => {
    const gate = describeActiveInsulinEstimate(0, true, 1);
    expect(gate.available).toBe(true);
    expect(gate.isZero).toBe(true);
    expect(gate.value).toBe(0);
    expect(formatRemainingValue(gate.value)).toBe("0");
  });

  it("labels the figure without inventing precision", () => {
    expect(describeActiveInsulinLabel(describeActiveInsulinEstimate(0.4, true, 1))).toBe("1u remaining");
    expect(describeActiveInsulinLabel(describeActiveInsulinEstimate(0, true, 1))).toBe("0u remaining");
    expect(describeActiveInsulinLabel(describeActiveInsulinEstimate(0.4, false, 1))).toBe("Unavailable");
  });
});