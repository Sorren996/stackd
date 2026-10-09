// Stackd Insight Engine — Empirical Uncertainty Calibration (Milestone 4)
// Frontend/testable JavaScript mirror of base44/shared/uncertaintyCalibration.ts.

import { EVAL_HORIZONS } from "./evaluation";

export const UNCERTAINTY_VERSION = "1.0.0";
export const MIN_SAMPLES_FOR_CALIBRATION = 10;

const MIN_HORIZON_SAMPLES = 3;
const MAE_TO_SIGMA_MULTIPLIER = 1.25;
const MAX_SIGMA_MGDL = 80;
const MIN_SIGMA_FLOOR_MGDL = 5;

export function calibrateUncertainty(evaluatedProjections) {
  const valid = evaluatedProjections.filter(
    (p) => p.evaluation && p.evaluation.status === "evaluated"
  );

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
    };
  }

  const sigmaByHorizon = {};
  const horizonSampleCounts = {};

  for (const h of EVAL_HORIZONS) {
    const errors = [];
    for (const p of valid) {
      const horizonScores = (p.evaluation.horizons || []).filter(
        (s) => s.horizon_min === h && s.scored && s.abs_error != null
      );
      for (const s of horizonScores) {
        errors.push(s.abs_error);
      }
    }
    horizonSampleCounts[h] = errors.length;
    if (errors.length >= MIN_HORIZON_SAMPLES) {
      const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
      const sigma = Math.min(MAX_SIGMA_MGDL, Math.max(MIN_SIGMA_FLOOR_MGDL, mae * MAE_TO_SIGMA_MULTIPLIER));
      sigmaByHorizon[h] = Math.round(sigma * 10) / 10;
    }
  }

  const withIntervals = valid.filter(
    (p) => p.evaluation.coverage != null && (p.evaluation.horizons || []).some((s) => s.scored && s.in_interval !== null)
  );

  let coverageObserved = null;
  let coverageSampleCount = 0;

  if (withIntervals.length >= MIN_HORIZON_SAMPLES) {
    const allIntervalChecks = [];
    for (const p of withIntervals) {
      for (const s of (p.evaluation.horizons || [])) {
        if (s.scored && s.in_interval !== null) {
          allIntervalChecks.push(s.in_interval);
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
    horizonSampleCounts,
    coverageObserved,
    coverageSampleCount,
  };
}

export function getEmpiricalSigma(minOffset, calibration) {
  if (!calibration.calibrated || Object.keys(calibration.sigmaByHorizon).length === 0) {
    return null;
  }
  const horizons = Object.keys(calibration.sigmaByHorizon).map(Number).sort((a, b) => a - b);
  if (minOffset <= horizons[0]) return calibration.sigmaByHorizon[horizons[0]];
  if (minOffset >= horizons[horizons.length - 1]) return calibration.sigmaByHorizon[horizons.length - 1];
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