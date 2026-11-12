// Stackd Insight Engine — Glucose Superposition Model (shape engine)
//
// Backend (Deno) copy of src/lib/insightEngine/superposition.js. Both copies
// are deliberately small, pure, and identical in behaviour: the backend owns
// the stored projection, the frontend copy is what the tests exercise.
//
// WHAT THIS REPLACES.
// The previous engine extrapolated the recent sensor trend as a decaying
// "momentum" term and then multiplied the whole net rate by one learned
// factor. Against its own stored evaluations that produced sign-flipping
// errors inside a single hour (-59, -54, -39, -53, +7, +54, +93) and a hump
// height that tracked the slope of the last two readings (r = 0.91) while
// insulin per gram of carbohydrate stayed constant.
//
// WHAT THIS IS.
// Superposition on a shared 5-minute grid:
//
//   glucose(t) = anchor + ∫ [ carbs(t) − insulin(t) + momentum(t) ] dt
//
//   carbs(t)    = Σ grams × carbSensitivity × absorption_fraction(t − mealTime)
//   rescues(t)  = Σ grams × carbSensitivity × rescue_fraction(t − rescueTime)
//   insulin(t)  = Σ units × ISF × action_fraction(t − doseTime)
//   momentum(t) = opening residual × exp(−t / 25 min), capped at ±3 mg/dL/min
//
// MOMENTUM, AND WHY IT IS NOT THE OLD EXTRAPOLATOR.
// The curve must leave the anchor at the speed glucose is actually moving, or a
// falling morning is drawn as a rise while the arrow beside the reading points
// the other way. The opening residual is the measured velocity MINUS the
// mechanistic rate at the anchor: whatever the shapes do not yet explain is
// carried as a residual that decays with a 25-minute time constant and is gone
// by 45–60 minutes. It is a correction that hands off, never an extrapolation —
// it holds no opinion beyond about an hour, and its whole integrated
// contribution is bounded (18 mg/dL per mg/dL/min of residual).
//
// Both fractions are ACTIVITY RATES normalised so their area over the whole
// action equals 1: a dose always delivers exactly units × ISF mg/dL of
// lowering in total, and a meal exactly grams × carbSensitivity mg/dL of rise.
// The shapes only decide WHEN.
//
// REFERENCE FIGURES (cited so the shape is auditable; never claimed in copy):
//   Rapid-acting analogs (aspart, lispro, glulisine): onset 10–20 min, peak
//   60–90 min, duration 3–5 h at usual doses. Faster analogs act earlier
//   (faster-aspart onset ~5–10 min, peak ~55–60 min; lispro-aabc peak ~50 min).
//   Regular human insulin: onset ~30 min, peak 90–120 min, duration 6–8 h.
//   Dose-dependence: as the dose grows the peak moves later (toward
//   105–120 min) and duration lengthens toward ~6 h, because depot absorption
//   becomes rate-limiting at larger volumes. (Standard product-labelling
//   time-action descriptions for insulin aspart / lispro, and the rapid-acting
//   analog action curves reproduced by open-source AID systems.)
//   Carbohydrate: appearance peaks 45–90 min after a mixed meal, earlier for
//   high-glycaemic carbohydrate, and a high-fat / protein meal keeps delivering
//   glucose 3–5 h later.
//
// SAFETY: informational wellness estimate only. Never recommends, prescribes
// or calculates a dose. No accuracy claim is made anywhere in the app.
// Self-contained (no base44:runtime, no npm: imports).

import { measureVelocity, VELOCITY_MAX_MGDL_PER_MIN } from "./measuredVelocity.ts";

export const SUPERPOSITION_MODEL_VERSION = "2.1.0-momentum";

export const GRID_MIN = 5;
const MINUTE_MS = 60 * 1000;

interface InsulinShape {
  family: string;
  peakMin: number;
  durationMin: number;
  shapeExp: number;
}

interface CarbShape {
  firstPeakMin: number;
  durationMin: number;
  secondPeakMin: number | null;
  blend: number;
  secondShapeExp: number;
  shapeExp: number;
}

const INSULIN_SHAPES: Record<string, { basePeakMin: number; baseDurationMin: number }> = {
  faster_aspart: { basePeakMin: 55, baseDurationMin: 210 },
  lispro_aabc: { basePeakMin: 50, baseDurationMin: 200 },
  glulisine: { basePeakMin: 65, baseDurationMin: 220 },
  lispro: { basePeakMin: 70, baseDurationMin: 230 },
  aspart: { basePeakMin: 75, baseDurationMin: 235 },
  regular: { basePeakMin: 105, baseDurationMin: 330 },
};

const PEAK_SHIFT_PER_UNIT_MIN = 2.25;
const PEAK_SHIFT_CAP_MIN = 45;
const DURATION_SHIFT_PER_UNIT_MIN = 6;
const DURATION_SHIFT_CAP_MIN = 120;
const MAX_DURATION_MIN = 360;
const INSULIN_SHAPE_EXP = 2.2;

const BASAL_HINTS = [
  "lantus", "levemir", "tresiba", "toujeo", "basaglar", "semglee", "rezvoglar",
  "nph", "novolin n", "humulin n", "degludec", "detemir", "glargine", "icodec", "awiqli",
];

export function isBasalInsulinType(insulinType: string): boolean {
  const lower = String(insulinType || "").toLowerCase();
  return BASAL_HINTS.some((h) => lower.includes(h));
}

function insulinFamily(insulinType: string): string {
  const lower = String(insulinType || "").toLowerCase();
  if (/fiasp|faster|ultra-?rapid/.test(lower)) return "faster_aspart";
  if (/lyumjev|aabc|url-?li/.test(lower)) return "lispro_aabc";
  if (/apidra|glulisine/.test(lower)) return "glulisine";
  if (/lispro|humalog/.test(lower)) return "lispro";
  if (/aspart|novolog|novorapid/.test(lower)) return "aspart";
  if (/regular|humulin r|novolin r/.test(lower)) return "regular";
  return "aspart";
}

export function insulinShapeFor(units: number, insulinType?: string): InsulinShape {
  const family = insulinFamily(String(insulinType || ""));
  const base = INSULIN_SHAPES[family] || INSULIN_SHAPES.aspart;
  const u = Math.max(0.5, Math.min(60, Number(units) || 0));
  const peakMin = base.basePeakMin + Math.min(PEAK_SHIFT_CAP_MIN, u * PEAK_SHIFT_PER_UNIT_MIN);
  const durationMin = Math.min(
    MAX_DURATION_MIN,
    base.baseDurationMin + Math.min(DURATION_SHIFT_CAP_MIN, u * DURATION_SHIFT_PER_UNIT_MIN)
  );
  return {
    family,
    peakMin: Math.round(peakMin * 10) / 10,
    durationMin: Math.round(durationMin * 10) / 10,
    shapeExp: INSULIN_SHAPE_EXP,
  };
}

const aucCache = new Map<string, number>();

function gammaRate(t: number, peakMin: number, shapeExp: number): number {
  if (!(t > 0) || !(peakMin > 0)) return 0;
  const ratio = t / peakMin;
  if (ratio > 12) return 0;
  return Math.pow(ratio, shapeExp) * Math.exp(shapeExp * (1 - ratio));
}

function gammaAuc(peakMin: number, durationMin: number, shapeExp: number): number {
  const key = `${peakMin}|${durationMin}|${shapeExp}`;
  const cached = aucCache.get(key);
  if (cached != null) return cached;
  let area = 0;
  const step = 1;
  for (let t = 0; t < durationMin; t += step) {
    area += ((gammaRate(t, peakMin, shapeExp) + gammaRate(t + step, peakMin, shapeExp)) / 2) * step;
  }
  aucCache.set(key, area);
  return area;
}

export function insulinActivityRate(minSinceDose: number, shape: InsulinShape): number {
  if (!(minSinceDose > 0) || !shape) return 0;
  if (minSinceDose >= shape.durationMin) return 0;
  const area = gammaAuc(shape.peakMin, shape.durationMin, shape.shapeExp);
  if (!(area > 0)) return 0;
  return gammaRate(minSinceDose, shape.peakMin, shape.shapeExp) / area;
}

export function insulinActionFraction(minSinceDose: number, shape: InsulinShape): number {
  if (!(minSinceDose > 0) || !shape) return 0;
  if (minSinceDose >= shape.durationMin) return 1;
  const area = gammaAuc(shape.peakMin, shape.durationMin, shape.shapeExp);
  if (!(area > 0)) return 0;
  let delivered = 0;
  const step = 1;
  const cap = Math.min(minSinceDose, shape.durationMin);
  for (let t = 0; t < cap; t += step) {
    delivered += ((gammaRate(t, shape.peakMin, shape.shapeExp) + gammaRate(t + step, shape.peakMin, shape.shapeExp)) / 2) * step;
  }
  return Math.max(0, Math.min(1, delivered / area));
}

const CARB_SHAPES: Record<string, { firstPeakMin: number; durationMin: number; secondPeakMin: number | null; blend: number; secondShapeExp: number }> = {
  fast: { firstPeakMin: 35, durationMin: 150, secondPeakMin: null, blend: 0, secondShapeExp: 2.2 },
  mixed: { firstPeakMin: 65, durationMin: 210, secondPeakMin: null, blend: 0, secondShapeExp: 2.2 },
  high_fat: { firstPeakMin: 50, durationMin: 300, secondPeakMin: 150, blend: 0.65, secondShapeExp: 2.0 },
};

export function carbShapeFor(speedClass?: string, speedFactor?: number | null): CarbShape {
  const base = CARB_SHAPES[String(speedClass || "mixed")] || CARB_SHAPES.mixed;
  const s = Number.isFinite(Number(speedFactor)) && Number(speedFactor) > 0
    ? Math.max(0.7, Math.min(1.45, Number(speedFactor)))
    : 1;
  const firstPeakMin = Math.max(20, Math.min(120, base.firstPeakMin * s));
  const durationMin = Math.max(90, Math.min(360, base.durationMin * s));
  const secondPeakMin = base.secondPeakMin == null
    ? null
    : Math.max(firstPeakMin + 40, Math.min(durationMin - 20, base.secondPeakMin * s));
  return {
    firstPeakMin,
    durationMin,
    secondPeakMin,
    blend: base.blend,
    secondShapeExp: base.secondShapeExp,
    shapeExp: 3.0,
  };
}

function carbRateRaw(t: number, shape: CarbShape): number {
  const single = gammaRate(t, shape.firstPeakMin, shape.shapeExp);
  if (!shape.secondPeakMin || !(shape.blend > 0)) return single;
  const second = gammaRate(t, shape.secondPeakMin, shape.secondShapeExp);
  return single * (1 - shape.blend) + second * shape.blend;
}

function carbAuc(shape: CarbShape): number {
  const key = `carb|${shape.firstPeakMin}|${shape.durationMin}|${shape.secondPeakMin}|${shape.blend}|${shape.shapeExp}|${shape.secondShapeExp}`;
  const cached = aucCache.get(key);
  if (cached != null) return cached;
  let area = 0;
  const step = 1;
  for (let t = 0; t < shape.durationMin; t += step) {
    area += ((carbRateRaw(t, shape) + carbRateRaw(t + step, shape)) / 2) * step;
  }
  aucCache.set(key, area);
  return area;
}

export function carbAbsorptionRate(minSinceMeal: number, shape: CarbShape): number {
  if (!(minSinceMeal > 0) || !shape) return 0;
  if (minSinceMeal >= shape.durationMin) return 0;
  const area = carbAuc(shape);
  if (!(area > 0)) return 0;
  return carbRateRaw(minSinceMeal, shape) / area;
}

export function carbAbsorptionFraction(minSinceMeal: number, shape: CarbShape): number {
  if (!(minSinceMeal > 0) || !shape) return 0;
  if (minSinceMeal >= shape.durationMin) return 1;
  const area = carbAuc(shape);
  if (!(area > 0)) return 0;
  let delivered = 0;
  const step = 1;
  const cap = Math.min(minSinceMeal, shape.durationMin);
  for (let t = 0; t < cap; t += step) {
    delivered += ((carbRateRaw(t, shape) + carbRateRaw(t + step, shape)) / 2) * step;
  }
  return Math.max(0, Math.min(1, delivered / area));
}

// ── Rescue carbohydrate shape ──────────────────────────────────────────────
// A rescue carbohydrate (glucose tabs, juice, a fizzy drink) is not a meal. It
// starts acting within 10–15 minutes, peaks at 20–30, and is essentially spent
// by 45–60. It therefore gets its own term with its own shape, so it can never
// inherit a meal's high-fat tail, and the mass it contributes is exactly the
// grams logged for the rescue — never a share of some larger meal.
export const RESCUE_PEAK_MIN = 25;
export const RESCUE_DURATION_MIN = 60;

export function rescueShapeFor(speedFactor?: number | null): CarbShape {
  const s = Number.isFinite(Number(speedFactor)) && Number(speedFactor) > 0
    ? Math.max(0.75, Math.min(1.35, Number(speedFactor)))
    : 1;
  return {
    firstPeakMin: Math.max(15, Math.min(35, RESCUE_PEAK_MIN * s)),
    durationMin: Math.max(45, Math.min(75, RESCUE_DURATION_MIN * s)),
    secondPeakMin: null,
    blend: 0,
    secondShapeExp: 1,
    shapeExp: 2.0,
  };
}

// Absorption rate (fraction of the rescue's grams per minute), area = 1.
export function rescueAbsorptionRate(minSinceRescue: number, shape: CarbShape): number {
  return carbAbsorptionRate(minSinceRescue, shape);
}

export const MOMENTUM_TAU_MIN = 25;
export const MAX_MOMENTUM_MGDL_PER_MIN = VELOCITY_MAX_MGDL_PER_MIN;
export const UNEXPLAINED_FALL_RATE = -1.5;
export const UNEXPLAINED_FALL_SCALE = 0.35;

export function momentumRate(minOffset: number, startRateMgDlPerMin: number): number {
  if (!(minOffset >= 0) || !startRateMgDlPerMin) return 0;
  return startRateMgDlPerMin * Math.exp(-minOffset / MOMENTUM_TAU_MIN);
}

function clampMomentum(rate: number): number {
  return Math.max(-MAX_MOMENTUM_MGDL_PER_MIN, Math.min(MAX_MOMENTUM_MGDL_PER_MIN, rate));
}

// The curve begins at the reading itself. An earlier version nudged the start
// by a few points (a lag correction), so the drawn line never touched the solid
// one and the forecast appeared to disagree with the value on screen. The
// anchor is the one value actually measured, so offset 0 IS that value.

export const GLUCOSE_FLOOR = 40;
export const GLUCOSE_CEILING = 400;

export interface SuperpositionInputs {
  anchorValue: number;
  anchorTime: number;
  readings?: Array<{ time: number; value: number }>;
  meals?: Array<{ carbs: number; consumedAt: number; speedClass?: string; speedFactor?: number | null }>;
  /** Rescue carbs only. Their own mass and their own short curve. */
  rescues?: Array<{ grams: number; atTime: number; magnitude?: number; speedFactor?: number | null }>;
  doses?: Array<{ units: number; atTime: number; insulinType?: string }>;
  isf?: number | null;
  mgPerGram?: number | null;
  horizonMin?: number;
  stepMin?: number;
}

export interface SuperpositionPoint {
  min_offset: number;
  time: number;
  value: number;
  rate: number;
  carbRate: number;
  rescueRate: number;
  insulinRate: number;
  momentumRate: number;
}

export function projectSuperposition(inputs: SuperpositionInputs): {
  points: SuperpositionPoint[];
  diagnostics: any;
} {
  const {
    anchorValue,
    anchorTime,
    readings = [],
    meals = [],
    rescues = [],
    doses = [],
    isf,
    mgPerGram,
    horizonMin = 120,
    stepMin = GRID_MIN,
  } = inputs || ({} as SuperpositionInputs);

  const horizon = Math.max(5, Math.min(180, Number(horizonMin) || 120));
  const step = Math.max(1, Number(stepMin) || GRID_MIN);
  const anchor = Number(anchorValue);
  if (!Number.isFinite(anchor) || !Number.isFinite(Number(anchorTime))) {
    return { points: [], diagnostics: { reason: "no_anchor" } };
  }

  const insulinSensitivity = Number.isFinite(Number(isf)) && Number(isf) > 0 ? Number(isf) : null;
  const carbSensitivity = Number.isFinite(Number(mgPerGram)) && Number(mgPerGram) > 0 ? Number(mgPerGram) : null;

  const doseTerms = (doses || [])
    .filter((d) => d && Number(d.units) > 0 && Number.isFinite(Number(d.atTime)))
    .map((d) => ({
      units: Number(d.units),
      atTime: Number(d.atTime),
      shape: insulinShapeFor(d.units, d.insulinType),
    }));

  const mealTerms = (meals || [])
    .filter((m) => m && Number(m.carbs) > 0 && Number.isFinite(Number(m.consumedAt)))
    .map((m) => ({
      carbs: Number(m.carbs),
      consumedAt: Number(m.consumedAt),
      shape: carbShapeFor(m.speedClass || "mixed", m.speedFactor),
    }));

  // Rescue carbs are their own term: their own mass (exactly the grams logged)
  // and their own short curve, so a rescue can end and insulin can take over.
  const rescueTerms = (rescues || [])
    .filter((r) => r && Number(r.grams) > 0 && Number.isFinite(Number(r.atTime)))
    .map((r) => ({
      grams: Number(r.grams),
      atTime: Number(r.atTime),
      magnitude: Number.isFinite(Number(r.magnitude)) ? Math.max(0.7, Math.min(1.3, Number(r.magnitude))) : 1,
      shape: rescueShapeFor(r.speedFactor),
    }));

  const carbRateAt = (tMin: number): number => {
    if (carbSensitivity == null) return 0;
    let rate = 0;
    for (const m of mealTerms) {
      const elapsed = tMin - (m.consumedAt - anchorTime) / MINUTE_MS;
      rate += m.carbs * carbSensitivity * carbAbsorptionRate(elapsed, m.shape);
    }
    return rate;
  };

  const rescueRateAt = (tMin: number): number => {
    if (carbSensitivity == null) return 0;
    let rate = 0;
    for (const r of rescueTerms) {
      const elapsed = tMin - (r.atTime - anchorTime) / MINUTE_MS;
      rate += r.grams * carbSensitivity * r.magnitude * rescueAbsorptionRate(elapsed, r.shape);
    }
    return rate;
  };

  const insulinRateAt = (tMin: number): number => {
    if (insulinSensitivity == null) return 0;
    let rate = 0;
    for (const d of doseTerms) {
      const elapsed = tMin - (d.atTime - anchorTime) / MINUTE_MS;
      rate += d.units * insulinSensitivity * insulinActivityRate(elapsed, d.shape);
    }
    return rate;
  };

  const mechanisticRateAtAnchor = carbRateAt(0) + rescueRateAt(0) - insulinRateAt(0);

  // ── Opening rate ───────────────────────────────────────────────────────
  // The measured velocity is the rate the curve must leave the anchor at. The
  // mechanistic shapes already claim `mechanisticRateAtAnchor`, so the residual
  // carried by momentum is the difference: at offset 0 the total rate IS the
  // measured velocity, and as that residual decays the shapes take over without
  // a seam. With nothing measurable nothing is added — the shapes stand alone
  // rather than a zero being invented.
  const measured = measureVelocity(readings as any[], anchorTime);
  const measuredVelocity = measured.velocity;

  let momentumStart = 0;
  let momentumDamped = false;
  if (measuredVelocity != null) {
    momentumStart = measuredVelocity - mechanisticRateAtAnchor;
    const nothingOnBoard = mealTerms.length === 0 && rescueTerms.length === 0 && doseTerms.length === 0;
    if (measuredVelocity <= UNEXPLAINED_FALL_RATE && nothingOnBoard) {
      momentumStart *= UNEXPLAINED_FALL_SCALE;
      momentumDamped = true;
    }
    momentumStart = clampMomentum(momentumStart);
  }
  const openingRate = mechanisticRateAtAnchor + momentumStart;

  // Offset 0 is the reading itself — the same number the solid line ends on.
  let value = anchor;

  const points: SuperpositionPoint[] = [];
  let previousRate = 0;
  for (let offset = 0; offset <= horizon; offset += step) {
    const carbRate = carbRateAt(offset);
    const rescueRate = rescueRateAt(offset);
    const insulinRate = insulinRateAt(offset);
    const momentum = momentumRate(offset, momentumStart);
    const rate = carbRate + rescueRate - insulinRate + momentum;

    // Trapezoid across the step, so a segment's slope is the average of the two
    // endpoints and the first point is the anchor exactly, never a step past it.
    if (offset > 0) value += ((previousRate + rate) / 2) * step;
    previousRate = rate;
    value = Math.max(GLUCOSE_FLOOR, Math.min(GLUCOSE_CEILING, value));

    points.push({
      min_offset: offset,
      time: (Number(anchorTime) || 0) + offset * MINUTE_MS,
      value: offset === 0 ? anchor : Math.round(value),
      rate: Math.round(rate * 1000) / 1000,
      carbRate,
      rescueRate,
      insulinRate,
      momentumRate: momentum,
    });
  }

  return {
    points,
    diagnostics: {
      version: SUPERPOSITION_MODEL_VERSION,
      lagCorrection: 0,
      carbSensitivity,
      insulinSensitivity,
      rateAtAnchor: Math.round(mechanisticRateAtAnchor * 1000) / 1000,
      momentum: {
        measuredVelocity,
        appliedStart: Math.round(momentumStart * 1000) / 1000,
        openingRate: Math.round(openingRate * 1000) / 1000,
        mechanisticRateAtAnchor: Math.round(mechanisticRateAtAnchor * 1000) / 1000,
        tauMin: MOMENTUM_TAU_MIN,
        cap: MAX_MOMENTUM_MGDL_PER_MIN,
        damped: momentumDamped,
        method: measured.method,
        sampleCount: measured.sampleCount,
        spanMin: measured.spanMin,
        unusableReason: measured.reason,
      },
      doseTerms: doseTerms.map((d) => ({
        units: d.units,
        peakMin: d.shape.peakMin,
        durationMin: d.shape.durationMin,
        family: d.shape.family,
      })),
      mealTerms: mealTerms.map((m) => ({
        carbs: m.carbs,
        peakMin: Math.round(m.shape.firstPeakMin),
        durationMin: Math.round(m.shape.durationMin),
      })),
      rescueTerms: rescueTerms.map((r) => ({
        grams: r.grams,
        peakMin: Math.round(r.shape.firstPeakMin),
        durationMin: Math.round(r.shape.durationMin),
      })),
    },
  };
}