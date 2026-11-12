import { it } from "vitest";
import { projectSuperposition, insulinShapeFor, insulinActionFraction, insulinActivityRate } from "../superposition";

const now = Date.now();

it("diag3", () => {
  const anchorTime = now - 5 * 60000;
  for (const units of [0, 2, 5]) {
    for (const horizon of [60, 120]) {
      const out = [];
      for (const carbs of [40, 80]) {
        const m = projectSuperposition({
          anchorValue: 140,
          anchorTime,
          readings: [],
          meals: [{ carbs, consumedAt: now - 30 * 60000, speedClass: "mixed", speedFactor: 1 }],
          doses: units ? [{ units, atTime: now - 30 * 60000, insulinType: "NovoLog" }] : [],
          isf: 40,
          mgPerGram: 4,
          horizonMin: horizon,
          stepMin: 5,
        });
        const start = m.points[0].value;
        let best = m.points[0];
        for (const p of m.points) if (p.value > best.value) best = p;
        out.push(`carbs=${carbs} hump=${best.value - start} peakAt=${best.min_offset}`);
      }
      console.log(`u=${units} h=${horizon} `, out.join(" | "));
    }
  }
});

it("diag2", () => {
  const anchorTime = now - 5 * 60000;
  for (const units of [10, 20]) {
    const sh = insulinShapeFor(units, "NovoLog");
    let total = 0;
    for (let t = 0; t < sh.durationMin; t += 0.5) {
      total += ((insulinActivityRate(t, sh) + insulinActivityRate(t + 0.5, sh)) / 2) * 0.5;
    }
    console.log("AUC units", units, "peak", sh.peakMin, "dur", sh.durationMin, "total", total.toFixed(4));
  }
  for (const units of [10, 20]) {
    const m = projectSuperposition({
      anchorValue: 140,
      anchorTime,
      readings: [],
      meals: [{ carbs: 40, consumedAt: now - 30 * 60000, speedClass: "mixed", speedFactor: 1 }],
      doses: [{ units, atTime: now - 30 * 60000, insulinType: "NovoLog" }],
      isf: 40,
      mgPerGram: 4,
      horizonMin: 60,
      stepMin: 5,
    });
    const sumIn = m.points.reduce((s, p) => s + (p.min_offset > 0 ? p.insulinRate * 5 : 0), 0);
    const sumCarb = m.points.reduce((s, p) => s + (p.min_offset > 0 ? p.carbRate * 5 : 0), 0);
    console.log("units", units, "sumInsulin", sumIn.toFixed(2), "sumCarb", sumCarb.toFixed(2), "lag", m.diagnostics.lagCorrection);
    console.log("  insRates", m.points.map((p) => p.insulinRate.toFixed(2)).join(","));
    console.log("  carbRates", m.points.map((p) => p.carbRate.toFixed(2)).join(","));
    console.log("  values", m.points.map((p) => p.value).join(","));
    const sh = insulinShapeFor(units, "NovoLog");
    console.log("  F60", insulinActionFraction(60, sh).toFixed(4), "unitsF", (units * insulinActionFraction(60, sh)).toFixed(3));
  }
});