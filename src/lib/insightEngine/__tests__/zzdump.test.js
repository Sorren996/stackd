import { it } from "vitest";
import { normalizeInputs, projectGlucose } from "../index";

const NOW = Date.parse("2026-11-12T18:00:00Z");
const MIN = 60000;
const readings = Array.from({ length: 13 }, (_, i) => ({
  recorded_at: new Date(NOW - (12 - i) * 5 * MIN).toISOString(), value: 140, source: "dexcom",
}));
const SETTINGS = {
  insulin_sensitivity_mgdl_per_unit: 50, meal_insulin_units_per_5g: 0.4,
  target_range_low: 70, target_range_high: 180, meal_outcome_window_minutes: 240,
};
function run({ carbs = 0, units = 0 }) {
  const meals = carbs > 0 ? [{ id: "m", carbs, consumed_at: new Date(NOW - 20 * MIN).toISOString(), classification: "meal" }] : [];
  const doses = units > 0 ? [{ id: "d", insulin_type: "NovoLog", units, administered_at: new Date(NOW - 20 * MIN).toISOString() }] : [];
  const snap = normalizeInputs(readings, meals, doses, SETTINGS, NOW);
  const r = projectGlucose(snap, { horizonMin: 120 });
  const at = (o) => r.trajectory.find((p) => p.min_offset === o)?.value;
  return { len: r.trajectory.length, at15: at(15), at30: at(30), at60: at(60), at90: at(90), at120: at(120), peak: Math.max(...r.trajectory.map((p) => p.value)) };
}
it("dumps", () => {
  console.log("1u", JSON.stringify(run({ units: 1 })));
  console.log("2u", JSON.stringify(run({ units: 2 })));
  console.log("4u", JSON.stringify(run({ units: 4 })));
  console.log("40g", JSON.stringify(run({ carbs: 40 })));
  console.log("80g", JSON.stringify(run({ carbs: 80 })));
  console.log("20g", JSON.stringify(run({ carbs: 20 })));
});