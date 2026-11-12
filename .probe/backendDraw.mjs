// One-off parity probe: the SAME clean-afternoon scenario run through the
// backend engine that actually persists projections.
import { normalizeInputs, projectGlucose } from "../base44/shared/insightEngine.ts";
import { calibrateUncertainty } from "../base44/shared/uncertaintyCalibration.ts";

const NOW = Date.parse("2026-11-12T18:00:00Z");
const MIN = 60000;

const readings = Array.from({ length: 200 }, (_, i) => ({
  recorded_at: new Date(NOW - (199 - i) * 5 * MIN).toISOString(),
  value: 165 + (i % 2 === 0 ? 0.75 : -0.75),
  source: "dexcom",
}));

const doses = [
  { id: "d1", insulin_type: "NovoLog", units: 4, administered_at: new Date(NOW - 30 * MIN).toISOString() },
  { id: "d2", insulin_type: "NovoLog", units: 2, administered_at: new Date(NOW - 10 * MIN).toISOString() },
];

const settings = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 0.4,
  target_range_low: 70,
  target_range_high: 180,
  meal_outcome_window_minutes: 240,
};

const snapshot = normalizeInputs(readings, [], doses, settings, NOW);
const plain = projectGlucose(snapshot, {});
const priorCal = calibrateUncertainty(
  Array.from({ length: 40 }, (_, i) => ({
    model_version: "1.0.0-baseline",
    evaluation: {
      status: "evaluated", mae: 20, coverage: 0.8,
      horizons: [
        { horizon_min: 15, scored: true, abs_error: 12, error: i % 2 === 0 ? 12 : -12, in_interval: true },
        { horizon_min: 30, scored: true, abs_error: 24, error: i % 2 === 0 ? 24 : -24, in_interval: true },
        { horizon_min: 60, scored: true, abs_error: 39, error: i % 2 === 0 ? 39 : -39, in_interval: false },
      ],
    },
  })),
  { currentModelVersion: "2.0.0-superposition", volatilitySd: snapshot.dataQuality.volatilitySd }
);
const withPrior = projectGlucose(snapshot, { uncertaintyCalibration: priorCal });

const summarise = (r) => ({
  abstained: r.abstained,
  reason: r.abstainReason,
  horizon: r.horizonMinutes,
  offsets: r.trajectory.map((p) => p.min_offset),
  widths: r.trajectory.map((p) => p.upper - p.lower),
  bandSource: r.uncertainty?.bandSource,
  residualCount: r.uncertainty?.residualCount,
});

console.log("dq", JSON.stringify({
  readingCount: snapshot.dataQuality.readingCount,
  stale: snapshot.dataQuality.staleReadings,
  gap: snapshot.dataQuality.gapPresent,
  volatilitySd: snapshot.dataQuality.volatilitySd,
  activeDoseCount: snapshot.dataQuality.activeDoseCount,
  confounders: snapshot.dataQuality.confounders,
}));
console.log("heuristic", JSON.stringify(summarise(plain)));
console.log("prior", JSON.stringify(summarise(withPrior)));