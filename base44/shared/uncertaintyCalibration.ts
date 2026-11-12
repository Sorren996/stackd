// Stackd Insight Engine — Empirical Uncertainty Calibration (Milestone 4)
//
// Calibrates prediction-interval width (sigma) from the user's historical
// out-of-sample forecast errors.
//
// THREE SOURCES, IN ORDER OF PREFERENCE — and every projection records which one
// it used, so a band can always be audited:
//
//   "fitted"  — the current shape model has its own scored outcomes. Sigma comes
//               from that model's residuals alone.
//   "prior"   — the current model has not been scored yet, but earlier scored
//               forecasts (older model versions) exist. Those residuals are used
//               as the STARTING band, scaled by how volatile the sensor is right
//               now. This is what stops a new model from being deadlocked: a
//               model that abstains produces no residuals, and a model with no
//               residuals can never earn a band.
//   "heuristic" — genuinely nothing scored yet (a new account). Marked
//               uncalibrated, because it is.
//
// HONESTY PRINCIPLES:
//   - An interval is NOT claimed to be "calibrated" until residuals exist.
//   - Intervals are NOT narrowed merely because a personalized model is active.
//   - Band width is never a reason to withhold a forecast. Width is how "we are
//     less sure" is shown; the horizon is shortened instead (see the engine).
//
// Self-contained (no base44:runtime, no npm: imports).

import { EVAL_HORIZONS } from "./forecastEvaluation.ts";

export const UNCERTAINTY_VERSION = "1.1.0";

// Minimum evaluated projections to calibrate uncertainty empirically.
// Below this, the heuristic is used and the interval is marked uncalibrated.
export const MIN_SAMPLES_FOR_CALIBRATION = 10;

// Minimum scored observations at a specific horizon to use the empirical
// sigma for that horizon. Below this, the heuristic is used for that horizon.
const MIN_HORIZON_SAMPLES = 3;

// The interval the band claims to be: four times in five, the reading lands
// inside it. The half-width is therefore fitted from the user's OWN residual
// quantiles rather than from a multiple of their mean error — a quantile makes
// no assumption about the shape of the error distribution, and it does not
// widen every band to cover one bad afternoon.
export const NOMINAL_BAND_COVERAGE = 0.8;

function quantile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(values: number[]): number {
  return quantile(values, 0.5);
}

// Maximum sigma to prevent absurd intervals even with large empirical errors.
const MAX_SIGMA_MGDL = 95;

// Minimum sigma floor — even with very small empirical errors, the interval
// should not be narrower than this, to avoid false precision.
const MIN_SIGMA_FLOOR_MGDL = 5;

// ── The shape the fitted band must have ────────────────────────────────────
//
// 1. MONOTONE. The band can never be narrower at a later horizon than at an
//    earlier one. Production showed 84 mg/dL at 40 minutes and 18 at 120 —
//    claiming more confidence two hours out than at forty minutes, which the
//    engine cannot know. Raw per-horizon quantiles are therefore carried
//    forward as a running maximum, so a thin or unlucky horizon can never pull
//    the band back in.
// 2. SATURATING. The band grows towards a realistic ceiling of about 75 mg/dL
//    half-width instead of widening without limit.
export const UNCERTAINTY_CEILING_MGDL = 75;
const SATURATION_KNEE_MGDL = 45;

export function saturateHalfWidth(rawMgdl: number): number {
  if (!(rawMgdl > 0)) return 0;
  if (rawMgdl <= SATURATION_KNEE_MGDL) return rawMgdl;
  const room = UNCERTAINTY_CEILING_MGDL - SATURATION_KNEE_MGDL;
  return SATURATION_KNEE_MGDL + room * (1 - Math.exp(-(rawMgdl - SATURATION_KNEE_MGDL) / room));
}

// Carry each horizon's fitted width forward as a running maximum, then saturate.
// A horizon with no samples of its own inherits the width measured before it, so
// interpolation between horizons can never step back down.
export function monotoneSaturatingFit(rawByHorizon: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  let carried = 0;
  const horizons = [...EVAL_HORIZONS].sort((a, b) => a - b);
  for (const h of horizons) {
    const raw = rawByHorizon[h];
    if (Number.isFinite(raw)) carried = Math.max(carried, raw as number);
    if (!(carried > 0)) continue;
    const width = Math.max(MIN_SIGMA_FLOOR_MGDL, saturateHalfWidth(carried));
    out[h] = Math.round(width * 10) / 10;
  }
  return out;
}

// Where a band's width came from. Recorded on every projection.
export type BandSource = "fitted" | "prior" | "heuristic";

export interface UncertaintyCalibration {
  method: "heuristic" | "empirical_calibrated";
  version: string;
  sigmaByHorizon: Record<number, number>;  // empirical sigma at each horizon
  calibrated: boolean;
  sampleCount: number;                      // total evaluated projections used
  horizonSampleCounts: Record<number, number>;  // observations per horizon
  coverageObserved: number | null;           // observed interval coverage (0-1)
  coverageSampleCount: number;              // projections with intervals used for coverage
  // ── Audit ──
  bandSource: BandSource;                   // fitted | prior | heuristic
  residualCount: number;                    // residuals that produced this band
  priorResidualCount: number;               // residuals from earlier model versions
  volatilityScale: number;                  // multiplier applied to a prior band
}

export interface CalibrationOptions {
  // The shape model currently drawing forecasts. Residuals from this version are
  // the only ones that describe it directly; earlier versions' residuals are the
  // honest starting point until it has been scored itself.
  currentModelVersion?: string;
  // Reading-to-reading volatility right now, mg/dL per minute. A quieter sensor
  // than the history deserves a slightly narrower prior.
  volatilitySd?: number;
}

// A prior measured on a different stretch of days is scaled by how volatile the
// sensor is right now, so a clean afternoon does not inherit a rough week's width.
const VOLATILITY_REFERENCE = 1.0;
const MIN_VOLATILITY_SCALE = 0.6;
const MAX_VOLATILITY_SCALE = 1.4;

function volatilityScale(volatilitySd: number | undefined): number {
  const v = Number(volatilitySd);
  if (!Number.isFinite(v) || v <= 0) return 1;
  return Math.max(MIN_VOLATILITY_SCALE, Math.min(MAX_VOLATILITY_SCALE, v / VOLATILITY_REFERENCE));
}

type EvaluatedProjection = {
  model_version?: string;
  evaluation?: {
    status: string;
    mae: number | null;
    horizons?: Array<{
      horizon_min: number;
      scored: boolean;
      abs_error: number | null;
      in_interval: boolean | null;
      error?: number | null;
    }>;
    coverage?: number | null;
  };
};

function fitResiduals(rows: EvaluatedProjection[]): {
  rawByHorizon: Record<number, number>;
  horizonSampleCounts: Record<number, number>;
  total: number;
} {
  const rawByHorizon: Record<number, number> = {};
  const horizonSampleCounts: Record<number, number> = {};
  let total = 0;

  for (const h of EVAL_HORIZONS) {
    const residuals: number[] = [];
    for (const p of rows) {
      const horizonScores = p.evaluation!.horizons?.filter(
        (s) => s.horizon_min === h && s.scored && s.abs_error != null
      ) || [];
      for (const s of horizonScores) {
        // Signed residual where the evaluator stored one, so the band is centred
        // on where the model actually lands rather than on where it aimed.
        const signed = Number(s.error);
        residuals.push(Number.isFinite(signed) ? signed : (s.abs_error as number));
      }
    }

    horizonSampleCounts[h] = residuals.length;
    total += residuals.length;

    if (residuals.length >= MIN_HORIZON_SAMPLES) {
      const centre = median(residuals);
      const deviations = residuals.map((r) => Math.abs(r - centre));
      const halfWidth = quantile(deviations, NOMINAL_BAND_COVERAGE);
      rawByHorizon[h] = Math.min(
        MAX_SIGMA_MGDL,
        Math.max(MIN_SIGMA_FLOOR_MGDL, halfWidth)
      );
    }
  }

  return { rawByHorizon, horizonSampleCounts, total };
}

// ── Calibration from evaluation history ────────────────────────────────────

export function calibrateUncertainty(
  evaluatedProjections: EvaluatedProjection[],
  options: CalibrationOptions = {}
): UncertaintyCalibration {
  const valid = (evaluatedProjections || []).filter(
    (p) => p.evaluation && p.evaluation.status === "evaluated"
  );

  const scale = volatilityScale(options.volatilitySd);

  // Nothing scored at all: a genuinely new account. The heuristic stands and the
  // interval says so.
  if (valid.length < MIN_SAMPLES_FOR_CALIBRATION) {
    return {
      method: "heuristic",
      version: UNCERTAINTY_VERSION,
      sigmaByHorizon: {},
      calibrated: false,
      sampleCount: valid.length,
      horizonSampleCounts: {},
      coverageObserved: null,
      coverageSampleCount: 0,
      bandSource: "heuristic",
      residualCount: 0,
      priorResidualCount: 0,
      volatilityScale: 1,
    };
  }

  // The current model's own residuals — the only ones that describe it directly.
  const currentModelVersion = options.currentModelVersion || null;
  const currentRows = currentModelVersion
    ? valid.filter((p) => p.model_version === currentModelVersion)
    : valid;

  const currentFit = fitResiduals(currentRows);
  const fittedEnough = currentFit.total >= MIN_SAMPLES_FOR_CALIBRATION;

  // The starting band: the current model's residuals when it has earned them,
  // otherwise every scored forecast the account has (earlier model versions).
  const fit = fittedEnough ? currentFit : fitResiduals(valid);
  const bandSource: BandSource = fittedEnough ? "fitted" : "prior";

  if (fit.total < MIN_HORIZON_SAMPLES) {
    return {
      method: "heuristic",
      version: UNCERTAINTY_VERSION,
      sigmaByHorizon: {},
      calibrated: false,
      sampleCount: valid.length,
      horizonSampleCounts: fit.horizonSampleCounts,
      coverageObserved: null,
      coverageSampleCount: 0,
      bandSource: "heuristic",
      residualCount: fit.total,
      priorResidualCount: currentFit.total,
      volatilityScale: 1,
    };
  }

  // A prior measured earlier is scaled by how quiet the sensor is right now; a
  // fitted band is used exactly as measured.
  const rawForFit: Record<number, number> = {};
  for (const [h, width] of Object.entries(fit.rawByHorizon)) {
    rawForFit[Number(h)] = bandSource === "prior" ? width * scale : width;
  }

  // One fit for the whole ladder: carrying a running maximum makes the band
  // monotone (never narrower later), and saturation keeps it readable.
  const sigmaByHorizon = monotoneSaturatingFit(rawForFit);

  // Compute observed coverage from projections that had intervals.
  const withIntervals = valid.filter(
    (p) => p.evaluation!.coverage != null && p.evaluation!.horizons
      ?.some((s) => s.scored && s.in_interval !== null)
  );

  let coverageObserved: number | null = null;
  let coverageSampleCount = 0;

  if (withIntervals.length >= MIN_HORIZON_SAMPLES) {
    const allIntervalChecks: boolean[] = [];
    for (const p of withIntervals) {
      for (const s of (p.evaluation!.horizons || [])) {
        if (s.scored && s.in_interval !== null) {
          allIntervalChecks.push(s.in_interval as boolean);
        }
      }
    }
    if (allIntervalChecks.length >= MIN_HORIZON_SAMPLES) {
      coverageObserved = allIntervalChecks.filter((v) => v).length / allIntervalChecks.length;
      coverageObserved = Math.round(coverageObserved * 1000) / 1000;
      coverageSampleCount = withIntervals.length;
    }
  }

  const hasAnySigma = Object.keys(sigmaByHorizon).length > 0;

  return {
    method: hasAnySigma ? "empirical_calibrated" : "heuristic",
    version: UNCERTAINTY_VERSION,
    sigmaByHorizon,
    calibrated: hasAnySigma,
    sampleCount: valid.length,
    horizonSampleCounts: fit.horizonSampleCounts,
    coverageObserved,
    coverageSampleCount,
    bandSource: hasAnySigma ? bandSource : "heuristic",
    residualCount: fit.total,
    priorResidualCount: currentFit.total,
    volatilityScale: bandSource === "prior" ? Math.round(scale * 100) / 100 : 1,
  };
}

// ── Sigma lookup at a given time offset ─────────────────────────────────────

// Returns the empirically calibrated sigma at the given offset (minutes from
// anchor), interpolating between known horizons. Returns null if no empirical
// data is available at or near this offset (caller should use heuristic).
export function getEmpiricalSigma(
  minOffset: number,
  calibration: UncertaintyCalibration
): number | null {
  if (!calibration.calibrated || Object.keys(calibration.sigmaByHorizon).length === 0) {
    return null;
  }

  const horizons = Object.keys(calibration.sigmaByHorizon)
    .map(Number)
    .sort((a, b) => a - b);

  // Before the first known horizon — use the first horizon's sigma
  // (uncertainty doesn't shrink below the anchor-level error).
  if (minOffset <= horizons[0]) {
    return calibration.sigmaByHorizon[horizons[0]];
  }

  // After the last known horizon — use the last horizon's sigma
  // (uncertainty doesn't grow indefinitely beyond what we've measured).
  if (minOffset >= horizons[horizons.length - 1]) {
    return calibration.sigmaByHorizon[horizons[horizons.length - 1]];
  }

  // Interpolate between the two surrounding horizons.
  for (let i = 0; i < horizons.length - 1; i++) {
    const h0 = horizons[i];
    const h1 = horizons[i + 1];
    if (minOffset >= h0 && minOffset <= h1) {
      const s0 = calibration.sigmaByHorizon[h0];
      const s1 = calibration.sigmaByHorizon[h1];
      const frac = (minOffset - h0) / (h1 - h0);
      return Math.round((s0 + (s1 - s0) * frac) * 10) / 10;
    }
  }

  return null;
}