// Internal product-specific parameter architecture (bolus modelling).
//
// Purpose: make the per-product parameters that a bolus model needs
// INDEPENDENTLY REPRESENTABLE — onset, peak, tail/end, concentration,
// formulation and delivery route — and keep EVIDENCE METADATA strictly
// separate from the parameters that are actually live.
//
// It deliberately does NOT feed any calculation. Nothing here is imported by
// the pharmacology engine, so no research figure can silently become a
// production coefficient.
//
// LIVE parameters are read from the existing INSULIN_PROFILES registry (no
// numbers are copied), so this module cannot drift from the engine.
//
// RESEARCH-ONLY references are recorded for the future mapping work and are
// all marked `mayDriveCalculations: false`. They are study-average
// return-to-baseline endpoints from product prescribing information — NOT
// validated patient-level IOB functions.
//
// NOT ENABLED, BY DESIGN: auto weight scaling, extrapolation between sampled
// doses, personalized learning, and any new clinical coefficient.

import { INSULIN_PROFILES } from "./insulinPharmacology.js";
import { getDoseTierDIA } from "./iobModel.js";

export const MODEL_FAMILY = {
  BETA_DOSE_TIERED: "beta_dose_tiered",
  EXPONENTIAL_PEAK: "exponential_peak",
  PLATEAU: "plateau",
  PREMIX_COMPONENTS: "premix_components",
};

export const DELIVERY_ROUTE = {
  SUBCUTANEOUS: "subcutaneous",
  INHALED: "inhaled",
};

export const FORMULATION = {
  RAPID_ANALOG: "rapid_analog",
  FASTER_ACTING_ANALOG: "faster_acting_analog",
  REGULAR_HUMAN: "regular_human",
  CONCENTRATED_REGULAR: "concentrated_regular",
  ISOPHANE: "isophane",
  BASAL_ANALOG: "basal_analog",
  ULTRA_LONG_BASAL: "ultra_long_basal",
  WEEKLY_BASAL: "weekly_basal",
  PREMIX: "premixed",
};

export const PARAMETER_ORIGIN = {
  PROFILE_REGISTRY: "insulin_profiles",
  PENDING_REPLACEMENT: "pending_replacement",
  RESEARCH_ONLY: "research_only",
};

/**
 * Status of the end-point (duration) numbers that are live today.
 * Reported plainly rather than dressed up as validated.
 */
export const DURATION_PARAMETER_STATUS = {
  status: PARAMETER_ORIGIN.PENDING_REPLACEMENT,
  note:
    "The dose-tiered end points currently used for rapid-acting analogs are not clinically validated dose-duration values. They remain pending replacement, and no replacement mapping is enabled here.",
};

// Metadata the existing registry does not carry. Adds labels only — never a
// number used by the model.
const OVERRIDES = {
  "NovoLog": { formulation: FORMULATION.RAPID_ANALOG },
  "Humalog": { formulation: FORMULATION.RAPID_ANALOG },
  "Admelog": { formulation: FORMULATION.RAPID_ANALOG },
  "Apidra": { formulation: FORMULATION.RAPID_ANALOG },
  "Fiasp": { formulation: FORMULATION.FASTER_ACTING_ANALOG },
  "Lyumjev": { formulation: FORMULATION.FASTER_ACTING_ANALOG },
  "Afrezza": { formulation: FORMULATION.RAPID_ANALOG, route: DELIVERY_ROUTE.INHALED },
  "Regular (Humulin R/Novolin R)": { formulation: FORMULATION.REGULAR_HUMAN },
  "Humulin R U-500": { formulation: FORMULATION.CONCENTRATED_REGULAR },
  "NPH": { formulation: FORMULATION.ISOPHANE },
  "Humulin N": { formulation: FORMULATION.ISOPHANE },
  "Novolin N": { formulation: FORMULATION.ISOPHANE },
  "Lantus": { formulation: FORMULATION.BASAL_ANALOG },
  "Basaglar": { formulation: FORMULATION.BASAL_ANALOG },
  "Semglee": { formulation: FORMULATION.BASAL_ANALOG },
  "Rezvoglar": { formulation: FORMULATION.BASAL_ANALOG },
  "Toujeo": { formulation: FORMULATION.BASAL_ANALOG },
  "Levemir": { formulation: FORMULATION.BASAL_ANALOG },
  "Tresiba": { formulation: FORMULATION.ULTRA_LONG_BASAL },
  "Degludec U-200": { formulation: FORMULATION.ULTRA_LONG_BASAL },
  "Awiqli (Icodec)": { formulation: FORMULATION.WEEKLY_BASAL },
};

/**
 * Research-only references. Recorded so the pending mapping work has a real
 * starting point. None of these is a validated patient IOB function, and none
 * is wired into a calculation.
 */
export const RESEARCH_ONLY_REFERENCES = [
  {
    id: "fiasp-pi-table6",
    product: "Fiasp",
    source: "Fiasp prescribing information, Table 6",
    measures: "study-average time for glucose to return toward baseline",
    referencePoints: [
      { unitsPerKg: 0.1, hours: 5 },
      { unitsPerKg: 0.2, hours: 6 },
      { unitsPerKg: 0.4, hours: 7 },
    ],
    status: PARAMETER_ORIGIN.RESEARCH_ONLY,
    mayDriveCalculations: false,
    caveat:
      "Study-average return-to-baseline endpoints in a controlled clamp study. Not a validated patient-level IOB function; not weight-scaled here.",
  },
  {
    id: "lyumjev-pi-table7",
    product: "Lyumjev",
    source: "Lyumjev prescribing information, Table 7",
    measures: "study-average time for glucose to return toward baseline",
    referencePoints: [
      { units: 7, hours: 4.6 },
      { units: 15, hours: 6.2 },
      { units: 30, hours: 7.3 },
    ],
    status: PARAMETER_ORIGIN.RESEARCH_ONLY,
    mayDriveCalculations: false,
    caveat:
      "Study-average return-to-baseline endpoints. Not a validated patient-level IOB function and not applied to any product here.",
  },
];

function resolveFamily(profile) {
  if (profile.model === "premix") return MODEL_FAMILY.PREMIX_COMPONENTS;
  if (profile.model === "flat") return MODEL_FAMILY.PLATEAU;
  // Mirrors the engine's own detection (rapid-acting analog with the 300-min
  // profile entry) — read from the registry, not re-decided here.
  if (profile.category === "Rapid-Acting" && profile.model === "peaked" && Number(profile.duration) === 300) {
    return MODEL_FAMILY.BETA_DOSE_TIERED;
  }
  return MODEL_FAMILY.EXPONENTIAL_PEAK;
}

/** One product's independently representable parameter view. */
export function getProductParameterView(profileKey) {
  const profile = INSULIN_PROFILES[profileKey];
  if (!profile) return null;
  const override = OVERRIDES[profileKey] || {};
  const family = resolveFamily(profile);

  return {
    product: profileKey,
    display_name: profile.display_name,
    generic_name: profile.generic_name,
    concentration: profile.concentration,
    formulation: override.formulation || FORMULATION.RAPID_ANALOG,
    route: override.route || DELIVERY_ROUTE.SUBCUTANEOUS,
    modelFamily: family,
    // Only the dose-tiered rapid-analog family may use the rapid-analog
    // function. Regular, concentrated regular, premixed, inhaled and every
    // basal family are explicitly false.
    usesRapidAnalogFunction: family === MODEL_FAMILY.BETA_DOSE_TIERED,
    live: {
      origin: PARAMETER_ORIGIN.PROFILE_REGISTRY,
      onsetMinutes: Number(profile.onset) || null,
      peakMinutes: Number(profile.peak) || null,
      endMinutes: family === MODEL_FAMILY.BETA_DOSE_TIERED ? null : Number(profile.duration) || null,
      doseTieredEndMinutes:
        family === MODEL_FAMILY.BETA_DOSE_TIERED
          ? [4, 5, 15, 25].map((units) => getDoseTierDIA(units))
          : null,
      endMinutesOrigin:
        family === MODEL_FAMILY.BETA_DOSE_TIERED
          ? PARAMETER_ORIGIN.PENDING_REPLACEMENT
          : PARAMETER_ORIGIN.PROFILE_REGISTRY,
    },
    components: Array.isArray(profile.components)
      ? profile.components.map((c) => ({ ...c }))
      : null,
    // Evidence is attached for reference only. It is never merged into `live`.
    evidence: RESEARCH_ONLY_REFERENCES.filter((r) => r.product === profileKey),
  };
}

/** Every product, for inspection and for the isolation tests. */
export function listProductParameterViews() {
  return Object.keys(INSULIN_PROFILES).map((key) => getProductParameterView(key));
}