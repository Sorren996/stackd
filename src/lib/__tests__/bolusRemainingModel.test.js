import { describe, it, expect } from "vitest";
import {
  betaIOBFraction,
  getBetaIOB,
  getClearanceMinutes,
  getDoseTierDIA,
  runIOBValidation,
} from "../iobModel";
import {
  generateActivityCurve,
  getDoseIOB,
  getDoseStatus,
  getDoseTimingInfo,
  getTotalBolusIOB,
} from "../insulinPharmacology";
import { computeSharedActiveInsulin } from "../sharing/followerInsulin";
import { formatRemainingValue } from "../remainingInsulin";

const T0 = Date.parse("2026-11-12T08:00:00.000Z");
const MINUTE = 60 * 1000;
const at = (minutes) => new Date(T0 + minutes * MINUTE).toISOString();
const novoLog = (units, minutes = 0) => ({ insulin_type: "NovoLog", units, administered_at: at(minutes) });

describe("beta residual — no early-zero threshold", () => {
  const DOSE = 10;
  const DIA = 240;

  it("returns the whole dose at the start and zero only at the endpoint", () => {
    expect(getBetaIOB(DOSE, 0, DIA)).toBe(DOSE);
    expect(getBetaIOB(DOSE, DIA, DIA)).toBe(0);
  });

  it("preserves every positive residual fraction across the listed boundaries", () => {
    for (const fraction of [0.00001, 0.01, 0.49, 0.5, 0.99]) {
      const t = fraction * DIA;
      const expected = DOSE * betaIOBFraction(t, DIA);
      const actual = getBetaIOB(DOSE, t, DIA);
      expect(actual).toBeCloseTo(expected, 12);
      expect(actual).toBeGreaterThan(0);
    }
  });

  it("never zeroes a dose whose own remainder is below 0.49u", () => {
    // These are exactly the amounts the removed cutoff used to collapse to 0.
    for (const units of [0.00001, 0.01, 0.49, 0.5, 0.99]) {
      expect(getBetaIOB(units, 0, 210)).toBe(units);
      expect(getBetaIOB(units, 60, 210)).toBeGreaterThan(0);
    }
    expect(getBetaIOB(1, 0, 210)).toBe(1);
    expect(getBetaIOB(1.01, 0, 210)).toBe(1.01);
  });

  it("is exactly zero at and after the endpoint, and positive just before it", () => {
    expect(getBetaIOB(DOSE, DIA - 0.1, DIA)).toBeGreaterThan(0);
    expect(getBetaIOB(DOSE, DIA, DIA)).toBe(0);
    expect(getBetaIOB(DOSE, DIA + 0.1, DIA)).toBe(0);
    expect(getBetaIOB(DOSE, DIA + 600, DIA)).toBe(0);
  });

  it("protects against negative and non-finite input", () => {
    expect(getBetaIOB(-5, 60, DIA)).toBe(0);
    expect(getBetaIOB(Number.NaN, 60, DIA)).toBe(0);
    expect(getBetaIOB(DOSE, Number.NaN, DIA)).toBeGreaterThanOrEqual(0);
    expect(betaIOBFraction(Number.NaN, DIA)).toBe(1);
  });

  it("keeps its own validation suite green", () => {
    const result = runIOBValidation();
    expect(result.passed).toBe(true);
  });
});

describe("sampled activity curves include the exact model endpoint", () => {
  it("ends at the full duration for a 5u NovoLog dose, at a 5-minute step", () => {
    const curve = generateActivityCurve(novoLog(5), 5);
    const last = curve[curve.length - 1];
    expect(last.minute).toBe(240);
    expect(last.activeUnits).toBe(0);
    expect(last.iobFraction).toBe(0);
    // The sample before the endpoint keeps its real value — it is not forced to zero.
    const beforeLast = curve[curve.length - 2];
    expect(beforeLast.minute).toBe(235);
    expect(beforeLast.activeUnits).toBeGreaterThan(0);
  });

  it("still includes the endpoint when the duration is not a multiple of the interval", () => {
    const curve = generateActivityCurve(novoLog(5), 7);
    const last = curve[curve.length - 1];
    expect(last.minute).toBe(240);
    expect(last.activeUnits).toBe(0);
    for (const point of curve.slice(0, -1)) {
      expect(point.activeUnits).toBeGreaterThan(0);
    }

    const tenMinuteTier = generateActivityCurve(novoLog(4), 4); // 210 min tier
    expect(tenMinuteTier[tenMinuteTier.length - 1].minute).toBe(210);
    expect(tenMinuteTier[tenMinuteTier.length - 1].activeUnits).toBe(0);
  });

  it("reports a positive remainder until the model's own endpoint", () => {
    const dose = novoLog(5);
    expect(getDoseIOB(dose, T0 + 238 * MINUTE)).toBeGreaterThan(0);
    expect(getDoseIOB(dose, T0 + 240 * MINUTE)).toBe(0);
    expect(getDoseIOB(dose, T0 + 241 * MINUTE)).toBe(0);
  });
});

describe("NovoLog durations and countdowns match the retained parameters", () => {
  const cases = [
    { units: 5, minutes: 240 },
    { units: 15, minutes: 270 },
    { units: 20, minutes: 270 },
    { units: 30, minutes: 300 },
    { units: 40, minutes: 300 },
  ];

  it("keeps the tiered endpoints at 4h / 4h30m / 4h30m / 5h / 5h", () => {
    expect([5, 15, 20, 30, 40].map(getDoseTierDIA)).toEqual([240, 270, 270, 300, 300]);
  });

  it("aligns the countdown with the same endpoint the remainder reaches zero at", () => {
    for (const { units, minutes } of cases) {
      const dose = novoLog(units);

      const timing = getDoseTimingInfo(dose, T0);
      expect(timing.totalDurationMin).toBe(minutes);
      expect(timing.remainingMin).toBe(minutes);
      expect(timing.isExpired).toBe(false);

      const midway = getDoseTimingInfo(dose, T0 + (minutes / 2) * MINUTE);
      expect(midway.remainingMin).toBeCloseTo(minutes / 2, 6);
      expect(midway.progress).toBeCloseTo(0.5, 6);

      const justBefore = getDoseTimingInfo(dose, T0 + (minutes - 1) * MINUTE);
      expect(justBefore.remainingMin).toBeCloseTo(1, 6);
      expect(justBefore.isExpired).toBe(false);
      expect(getDoseIOB(dose, T0 + (minutes - 1) * MINUTE)).toBeGreaterThan(0);

      const atEndpoint = getDoseTimingInfo(dose, T0 + minutes * MINUTE);
      expect(atEndpoint.remainingMin).toBe(0);
      expect(atEndpoint.isExpired).toBe(true);
      expect(atEndpoint.progress).toBe(1);
      expect(getDoseIOB(dose, T0 + minutes * MINUTE)).toBe(0);
      expect(getDoseStatus(dose, T0 + minutes * MINUTE).phase).toBe("expired");
    }
  });

  it("reports the countdown as DIA minus elapsed", () => {
    expect(getClearanceMinutes(5, 0)).toBe(240);
    expect(getClearanceMinutes(5, 90)).toBe(150);
    expect(getClearanceMinutes(40, 299)).toBe(1);
    expect(getClearanceMinutes(40, 300)).toBe(0);
  });

  it("never shows an early 'cleared' endpoint like 2h24 for a 5u dose", () => {
    const timing = getDoseTimingInfo(novoLog(5), T0);
    expect(timing.totalDurationMin).not.toBe(144);
    expect(timing.totalDurationMin).toBe(240);
  });
});

describe("overlapping doses, future doses and invalid doses", () => {
  it("sums overlapping remainders RAW, independent of display rounding", () => {
    const first = novoLog(0.6, 0);
    const second = novoLog(0.6, 30);
    const now = T0 + 40 * MINUTE;

    const a = getDoseIOB(first, now);
    const b = getDoseIOB(second, now);
    const total = getTotalBolusIOB([first, second], now);

    expect(total).toBeCloseTo(a + b, 12);
    // Each dose is under 1u, so each displays "1".
    expect(formatRemainingValue(a)).toBe("1");
    expect(formatRemainingValue(b)).toBe("1");
    // The total is the RAW sum, formatted once — never 1 + 1 = 2.
    expect(formatRemainingValue(total)).toBe((a + b).toFixed(1));
    expect(formatRemainingValue(total)).not.toBe("2.0");
    expect(total).toBeLessThan(2);
  });

  it("does not model a future dose as active", () => {
    const future = novoLog(5, 60);
    const now = T0;
    expect(getDoseIOB(future, now)).toBe(0);
    expect(getDoseStatus(future, now).phase).toBe("scheduled");
    const timing = getDoseTimingInfo(future, now);
    expect(timing.remainingMin).toBe(240);
    expect(timing.isExpired).toBe(false);
    expect(timing.progress).toBe(0);
    expect(getTotalBolusIOB([future], now)).toBe(0);
  });

  it("does not invent a remainder for invalid doses", () => {
    expect(getDoseIOB({ insulin_type: "NovoLog", units: Number.NaN, administered_at: at(0) }, T0)).toBe(0);
    expect(getDoseIOB({ insulin_type: "NovoLog", units: -3, administered_at: at(0) }, T0)).toBe(0);
    expect(getDoseIOB({ insulin_type: "NovoLog", units: 5, administered_at: "not-a-date" }, T0)).toBe(0);
    expect(getDoseStatus({ insulin_type: "NovoLog", units: 5, administered_at: "not-a-date" }, T0).phase).toBe("expired");
  });
});

describe("follower estimate from the same model, behind the same gates", () => {
  const doses = [novoLog(5, 0)];

  it("matches the patient-side remainder for a confirmed plan", () => {
    const estimate = computeSharedActiveInsulin(doses, T0 + MINUTE, { doseMathAvailable: true });
    expect(estimate.available).toBe(true);
    expect(estimate.value).toBeCloseTo(getDoseIOB(doses[0], T0 + MINUTE), 12);
    expect(estimate.isZero).toBe(false);
  });

  it("stays unavailable while the plan is unconfirmed", () => {
    const estimate = computeSharedActiveInsulin(doses, T0 + MINUTE, { doseMathAvailable: false });
    expect(estimate.available).toBe(false);
    expect(estimate.reason).toBe("unconfirmed_plan");
  });

  it("reports a sub-unit remainder as 1u rather than zero", () => {
    const late = T0 + 237 * MINUTE; // 3 minutes before the 240-minute endpoint
    const estimate = computeSharedActiveInsulin(doses, late, { doseMathAvailable: true });
    expect(estimate.value).toBeGreaterThan(0);
    expect(estimate.value).toBeLessThan(1);
    expect(estimate.isZero).toBe(false);
    expect(formatRemainingValue(estimate.value)).toBe("1");
  });

  it("reports zero once every dose is past its modelled endpoint", () => {
    const estimate = computeSharedActiveInsulin(doses, T0 + 240 * MINUTE, { doseMathAvailable: true });
    expect(estimate.available).toBe(true);
    expect(estimate.isZero).toBe(true);
    expect(estimate.value).toBe(0);
  });
});