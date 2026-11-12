import { describe, it, expect } from "vitest";
import {
  DELIVERY_ROUTE,
  DURATION_PARAMETER_STATUS,
  FORMULATION,
  MODEL_FAMILY,
  RESEARCH_ONLY_REFERENCES,
  getProductParameterView,
  listProductParameterViews,
} from "../insulinProductProfiles";

// Architecture guards: parameters are representable per product, research
// evidence is separated from what is live, and nothing non-analog silently
// picks up a rapid-analog function.

describe("per-product parameter architecture", () => {
  it("represents onset, peak, end, concentration, formulation and route independently", () => {
    const view = getProductParameterView("NovoLog");
    expect(view.concentration).toBe("U-100");
    expect(view.formulation).toBe(FORMULATION.RAPID_ANALOG);
    expect(view.route).toBe(DELIVERY_ROUTE.SUBCUTANEOUS);
    expect(view.live.onsetMinutes).toBe(15);
    expect(view.live.peakMinutes).toBe(75);
    expect(view.live.origin).toBe("insulin_profiles");
    expect(view.live.doseTieredEndMinutes).toEqual([210, 240, 270, 300]);
  });

  it("marks the live rapid-analog end points as pending replacement, not validated", () => {
    expect(DURATION_PARAMETER_STATUS.status).toBe("pending_replacement");
    expect(getProductParameterView("NovoLog").live.endMinutesOrigin).toBe("pending_replacement");
    expect(getProductParameterView("Humalog").live.endMinutesOrigin).toBe("pending_replacement");
  });

  it("gives every rapid-acting analog the same shared tier list — no product-specific transplant", () => {
    const analogs = ["NovoLog", "Humalog", "Admelog", "Apidra", "Fiasp", "Lyumjev"];
    const lists = analogs.map((key) => getProductParameterView(key).live.doseTieredEndMinutes);
    for (const list of lists) expect(list).toEqual([210, 240, 270, 300]);
    // The faster-acting products were NOT given the research table's own numbers.
    const fiaspEvidenceHours = RESEARCH_ONLY_REFERENCES.find((r) => r.id === "fiasp-pi-table6")
      .referencePoints.map((p) => p.hours * 60);
    expect(fiaspEvidenceHours).toEqual([300, 360, 420]);
    expect(lists[4]).not.toEqual(fiaspEvidenceHours);
  });

  it("does not let regular, concentrated, premixed, inhaled or basal inherit a rapid-analog function", () => {
    const mustNotUse = [
      "Regular (Humulin R/Novolin R)",
      "Humulin R U-500",
      "NovoLog Mix 70/30",
      "Humalog Mix 75/25",
      "Humulin 70/30",
      "Ryzodeg 70/30",
      "Afrezza",
      "NPH",
      "Lantus",
      "Toujeo",
      "Levemir",
      "Tresiba",
      "Awiqli (Icodec)",
    ];
    for (const key of mustNotUse) {
      const view = getProductParameterView(key);
      expect(view, key).not.toBeNull();
      expect(view.usesRapidAnalogFunction, key).toBe(false);
    }

    expect(getProductParameterView("Afrezza").route).toBe(DELIVERY_ROUTE.INHALED);
    expect(getProductParameterView("Afrezza").live.endMinutes).toBe(180);
    expect(getProductParameterView("Regular (Humulin R/Novolin R)").live.endMinutes).toBe(480);
    expect(getProductParameterView("Humulin R U-500").formulation).toBe(FORMULATION.CONCENTRATED_REGULAR);
    expect(getProductParameterView("Tresiba").modelFamily).toBe(MODEL_FAMILY.PLATEAU);
    expect(getProductParameterView("NovoLog Mix 70/30").components).toHaveLength(2);
  });

  it("keeps research evidence out of the live parameters", () => {
    for (const reference of RESEARCH_ONLY_REFERENCES) {
      expect(reference.status).toBe("research_only");
      expect(reference.mayDriveCalculations).toBe(false);
      expect(reference.caveat.toLowerCase()).toContain("not a validated patient-level iob function");
    }

    const fiasp = getProductParameterView("Fiasp");
    expect(fiasp.evidence).toHaveLength(1);
    expect(Object.keys(fiasp.live)).not.toContain("evidence");
    expect(fiasp.live.endMinutes).toBeNull();

    const lyumjev = getProductParameterView("Lyumjev");
    expect(lyumjev.evidence[0].referencePoints).toEqual([
      { units: 7, hours: 4.6 },
      { units: 15, hours: 6.2 },
      { units: 30, hours: 7.3 },
    ]);
    expect(lyumjev.live.doseTieredEndMinutes).toEqual([210, 240, 270, 300]);
  });

  it("describes every product in the registry", () => {
    const views = listProductParameterViews();
    expect(views.length).toBeGreaterThan(20);
    for (const view of views) {
      expect(view.product).toBeTruthy();
      expect(view.concentration).toBeTruthy();
      expect(Object.values(MODEL_FAMILY)).toContain(view.modelFamily);
      expect([DELIVERY_ROUTE.SUBCUTANEOUS, DELIVERY_ROUTE.INHALED]).toContain(view.route);
    }
  });
});