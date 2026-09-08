// Stackd Insulin Activity Engine — single authoritative source of truth.
//
// Each commercially available insulin product has its OWN pharmacodynamic
// profile (onset / peak / duration / shape), drawn from FDA prescribing
// information and ADA Standards of Care. The activity model is a smooth,
// nonlinear pharmacodynamic curve — a normalized gamma (Erlang) distribution
// for peaked insulins (rapid / regular / NPH / premix bolus components) and a
// broad plateau curve for near-peakless basal insulins. Premixed products are
// decomposed into their components and summed. Every dose is modeled
// independently, so overlapping doses (bolus stacking and basal accumulation)
// emerge naturally from summing per-dose curves.
//
// IMPORTANT: This is a population-level ESTIMATE, not a measurement. IOB
// represents the estimated amount of a dose still contributing to insulin
// activity. It is never a dosing recommendation.

const MINUTE_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Insulin profile database
// ---------------------------------------------------------------------------
// `model`:
//   "peaked"  — gamma-shaped activity (rapid / faster / regular / U-500 / NPH)
//   "flat"    — broad plateau activity (glargine / detemir / degludec / icodec)
//   "premix"  — decomposed into `components` (each a reference to another profile)
// `shape` = integer gamma shape k (controls peak sharpness; larger = broader).
// `peak` in minutes (null for flat basal). `duration` in minutes (IOB → 0).

export const INSULIN_PROFILES = {
  // ----- Rapid / faster-acting -----
  "NovoLog": {
    display_name: "NovoLog", generic_name: "insulin aspart", concentration: "U-100",
    category: "Rapid-Acting", model: "peaked", onset: 15, peak: 75, duration: 300, shape: 4,
    color: "#38bdf8", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "NovoLog FDA Prescribing Information", date: "2024" }],
  },
  "Humalog": {
    display_name: "Humalog", generic_name: "insulin lispro", concentration: "U-100",
    category: "Rapid-Acting", model: "peaked", onset: 15, peak: 60, duration: 300, shape: 4,
    color: "#0ea5e9", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humalog FDA Prescribing Information", date: "2023" }],
  },
  "Admelog": {
    display_name: "Admelog", generic_name: "insulin lispro", concentration: "U-100",
    category: "Rapid-Acting", model: "peaked", onset: 15, peak: 60, duration: 300, shape: 4,
    color: "#38bdf8", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Admelog FDA Prescribing Information", date: "2017" }],
  },
  "Apidra": {
    display_name: "Apidra", generic_name: "insulin glulisine", concentration: "U-100",
    category: "Rapid-Acting", model: "peaked", onset: 12, peak: 55, duration: 300, shape: 4,
    color: "#60a5fa", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Apidra FDA Prescribing Information", date: "2023" }],
  },
  "Fiasp": {
    display_name: "Fiasp", generic_name: "faster-acting insulin aspart", concentration: "U-100",
    category: "Rapid-Acting", model: "peaked", onset: 4, peak: 45, duration: 300, shape: 3,
    color: "#22d3ee", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Fiasp FDA Prescribing Information", date: "2017" }, { name: "FDA Clinical Pharmacology Review — faster aspart", date: "2017" }],
  },
  "Lyumjev": {
    display_name: "Lyumjev", generic_name: "insulin lispro-aabc", concentration: "U-100",
    category: "Rapid-Acting", model: "peaked", onset: 4, peak: 45, duration: 300, shape: 3,
    color: "#06b6d4", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Lyumjev FDA Prescribing Information", date: "2020" }],
  },
  "Afrezza": {
    display_name: "Afrezza", generic_name: "inhaled human insulin", concentration: "inhaled",
    category: "Rapid-Acting", model: "peaked", onset: 2, peak: 18, duration: 180, shape: 2,
    color: "#67e8f9", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Afrezza FDA Prescribing Information", date: "2014" }],
  },

  // ----- Short-acting regular -----
  "Regular (Humulin R/Novolin R)": {
    display_name: "Regular", generic_name: "regular human insulin", concentration: "U-100",
    category: "Short-Acting", model: "peaked", onset: 30, peak: 150, duration: 480, shape: 5,
    color: "#fbbf24", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humulin R FDA Prescribing Information", date: "2023" }, { name: "ADA Standards of Care — insulin pharmacology", date: "2024" }],
  },

  // ----- Concentrated regular -----
  "Humulin R U-500": {
    display_name: "Humulin R U-500", generic_name: "regular human insulin (concentrated)", concentration: "U-500",
    category: "Short-Acting", model: "peaked", onset: 30, peak: 240, duration: 960, shape: 4,
    color: "#f59e0b", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humulin R U-500 FDA Prescribing Information", date: "2022" }, { name: "ADA Standards of Care — U-500 pharmacokinetics", date: "2024" }],
    notes: "Delayed, blunted, prolonged peak and longer duration vs U-100 regular.",
  },

  // ----- Intermediate (NPH) -----
  "NPH": {
    display_name: "NPH", generic_name: "insulin isophane", concentration: "U-100",
    category: "Intermediate-Acting", model: "peaked", onset: 90, peak: 360, duration: 1440, shape: 6,
    color: "#a78bfa", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humulin N / Novolin N FDA Prescribing Information", date: "2023" }],
  },
  "Humulin N": {
    display_name: "Humulin N", generic_name: "insulin isophane (human)", concentration: "U-100",
    category: "Intermediate-Acting", model: "peaked", onset: 90, peak: 360, duration: 1440, shape: 6,
    color: "#a78bfa", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humulin N FDA Prescribing Information", date: "2023" }],
  },
  "Novolin N": {
    display_name: "Novolin N", generic_name: "insulin isophane (human)", concentration: "U-100",
    category: "Intermediate-Acting", model: "peaked", onset: 90, peak: 360, duration: 1440, shape: 6,
    color: "#a78bfa", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Novolin N FDA Prescribing Information", date: "2023" }],
  },

  // ----- Long-acting basal -----
  "Lantus": {
    display_name: "Lantus", generic_name: "insulin glargine", concentration: "U-100",
    category: "Long-Acting", model: "flat", onset: 90, peak: null, duration: 1440, shape: 10,
    color: "#2dd4bf", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Lantus FDA Prescribing Information", date: "2023" }],
  },
  "Basaglar": {
    display_name: "Basaglar", generic_name: "insulin glargine", concentration: "U-100",
    category: "Long-Acting", model: "flat", onset: 90, peak: null, duration: 1440, shape: 10,
    color: "#14b8a6", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Basaglar FDA Prescribing Information", date: "2023" }],
  },
  "Semglee": {
    display_name: "Semglee", generic_name: "insulin glargine-yfgn", concentration: "U-100",
    category: "Long-Acting", model: "flat", onset: 90, peak: null, duration: 1440, shape: 10,
    color: "#2dd4bf", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Semglee FDA Prescribing Information", date: "2021" }],
  },
  "Rezvoglar": {
    display_name: "Rezvoglar", generic_name: "insulin glargine-aglr", concentration: "U-100",
    category: "Long-Acting", model: "flat", onset: 90, peak: null, duration: 1440, shape: 10,
    color: "#14b8a6", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Rezvoglar FDA Prescribing Information", date: "2021" }],
  },
  "Toujeo": {
    display_name: "Toujeo", generic_name: "insulin glargine", concentration: "U-300",
    category: "Ultra-Long-Acting", model: "flat", onset: 120, peak: null, duration: 1680, shape: 12,
    color: "#059669", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Toujeo FDA Prescribing Information", date: "2023" }, { name: "ADA Standards of Care — U-300 longer duration than U-100", date: "2024" }],
    notes: "Flatter and more prolonged than U-100 glargine.",
  },
  "Levemir": {
    display_name: "Levemir", generic_name: "insulin detemir", concentration: "U-100",
    category: "Long-Acting", model: "flat", onset: 90, peak: null, duration: 960, shape: 8,
    color: "#34d399", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Levemir FDA Prescribing Information", date: "2023" }],
    notes: "Relatively flat, ~14–24h depending on dose.",
  },

  // ----- Ultra-long basal -----
  "Tresiba": {
    display_name: "Tresiba", generic_name: "insulin degludec", concentration: "U-100",
    category: "Ultra-Long-Acting", model: "flat", onset: 90, peak: null, duration: 2520, shape: 16,
    color: "#10b981", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Tresiba FDA Prescribing Information", date: "2023" }],
    notes: "Essentially peakless; ~42h+ pharmacodynamic duration.",
  },
  "Degludec U-200": {
    display_name: "Tresiba U-200", generic_name: "insulin degludec", concentration: "U-200",
    category: "Ultra-Long-Acting", model: "flat", onset: 90, peak: null, duration: 2520, shape: 16,
    color: "#10b981", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Tresiba FDA Prescribing Information", date: "2023" }],
    notes: "Equivalent unit-based pharmacodynamics to U-100 degludec.",
  },

  // ----- Weekly basal -----
  "Awiqli (Icodec)": {
    display_name: "Awiqli", generic_name: "insulin icodec", concentration: "U-700",
    category: "Ultra-Long-Acting", model: "flat", onset: 120, peak: 1080, duration: 10080, shape: 22,
    color: "#047857", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Awiqli FDA Clinical Pharmacology Review", date: "2024" }],
    notes: "Weekly insulin. Weeklong half-life; broad low-amplitude profile with concentration peak ~18h. Overlapping weekly doses accumulate.",
  },

  // ----- Premixed (decomposed into components) -----
  "NovoLog Mix 70/30": {
    display_name: "NovoLog Mix 70/30", generic_name: "insulin aspart / insulin aspart protamine", concentration: "U-100",
    category: "Premixed", model: "premix",
    components: [{ type: "NPH", fraction: 0.7 }, { type: "NovoLog", fraction: 0.3 }],
    color: "#818cf8", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "NovoLog Mix 70/30 FDA Prescribing Information", date: "2023" }],
  },
  "Humalog Mix 75/25": {
    display_name: "Humalog Mix 75/25", generic_name: "insulin lispro / insulin lispro protamine", concentration: "U-100",
    category: "Premixed", model: "premix",
    components: [{ type: "NPH", fraction: 0.75 }, { type: "Humalog", fraction: 0.25 }],
    color: "#818cf8", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humalog Mix 75/25 FDA Prescribing Information", date: "2023" }],
  },
  "Humalog Mix 50/50": {
    display_name: "Humalog Mix 50/50", generic_name: "insulin lispro / insulin lispro protamine", concentration: "U-100",
    category: "Premixed", model: "premix",
    components: [{ type: "NPH", fraction: 0.5 }, { type: "Humalog", fraction: 0.5 }],
    color: "#818cf8", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humalog Mix 50/50 FDA Prescribing Information", date: "2023" }],
  },
  "Humulin 70/30": {
    display_name: "Humulin 70/30", generic_name: "insulin isophane / regular human insulin", concentration: "U-100",
    category: "Premixed", model: "premix",
    components: [{ type: "NPH", fraction: 0.7 }, { type: "Regular (Humulin R/Novolin R)", fraction: 0.3 }],
    color: "#818cf8", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Humulin 70/30 FDA Prescribing Information", date: "2023" }],
  },
  "Novolin 70/30": {
    display_name: "Novolin 70/30", generic_name: "insulin isophane / regular human insulin", concentration: "U-100",
    category: "Premixed", model: "premix",
    components: [{ type: "NPH", fraction: 0.7 }, { type: "Regular (Humulin R/Novolin R)", fraction: 0.3 }],
    color: "#818cf8", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Novolin 70/30 FDA Prescribing Information", date: "2023" }],
  },
  "Ryzodeg 70/30": {
    display_name: "Ryzodeg 70/30", generic_name: "insulin degludec / insulin aspart", concentration: "U-100",
    category: "Premixed", model: "premix",
    components: [{ type: "Tresiba", fraction: 0.7 }, { type: "NovoLog", fraction: 0.3 }],
    color: "#6ee7b7", profile_version: "1.0", source_last_reviewed: "2026-09",
    sources: [{ name: "Ryzodeg FDA Prescribing Information", date: "2023" }],
    notes: "70% degludec background + 30% aspart bolus component.",
  },
};

// Backward-compatible alias map (handles free-text / legacy insulin labels).
const INSULIN_TYPE_ALIASES = {
  "rapid acting": "NovoLog",
  "rapid-acting": "NovoLog",
  "rapid": "NovoLog",
  "fast acting": "NovoLog",
  "fast-acting": "NovoLog",
  "short acting": "Regular (Humulin R/Novolin R)",
  "short-acting": "Regular (Humulin R/Novolin R)",
  "regular insulin": "Regular (Humulin R/Novolin R)",
  "regular": "Regular (Humulin R/Novolin R)",
  "intermediate": "NPH",
  "intermediate acting": "NPH",
  "intermediate-acting": "NPH",
  "long acting": "Lantus",
  "long-acting": "Lantus",
  "basal": "Lantus",
  "ultra long acting": "Tresiba",
  "ultra-long acting": "Tresiba",
  "ultra-long-acting": "Tresiba",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

// Backward-compatible dose-multiplier interpolation helpers. The new engine
// uses dose-independent duration (per FDA/ADA — basal and bolus curves do not
// meaningfully shorten with smaller doses), but these remain exported so any
// legacy consumer keeps functioning.
const DURATION_MULTIPLIER_POINTS = [
  { units: 0, multiplier: 1 },
  { units: 100, multiplier: 1 },
];
const TAIL_MULTIPLIER_POINTS = [
  { units: 0, multiplier: 0.2 },
  { units: 100, multiplier: 0.2 },
];
const PEAK_MULTIPLIER_POINTS = [
  { units: 0, multiplier: 1 },
  { units: 100, multiplier: 1 },
];

export function interpolateControlPoints(units, points) {
  const safeUnits = Math.max(0, Number(units) || 0);
  if (!Array.isArray(points) || !points.length) return 1;
  if (safeUnits <= points[0].units) return points[0].multiplier;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (safeUnits > next.units) continue;
    const span = next.units - previous.units || 1;
    const ratio = (safeUnits - previous.units) / span;
    return previous.multiplier + (next.multiplier - previous.multiplier) * ratio;
  }
  return points[points.length - 1].multiplier;
}

export function getDoseDurationMultiplier(units) {
  return interpolateControlPoints(units, DURATION_MULTIPLIER_POINTS);
}
export function getDosePeakMultiplier(units) {
  return interpolateControlPoints(units, PEAK_MULTIPLIER_POINTS);
}
export function getDoseTailMultiplier(units) {
  return interpolateControlPoints(units, TAIL_MULTIPLIER_POINTS);
}

export function getInsulinProfile(insulinType) {
  if (!insulinType) return null;
  const direct = INSULIN_PROFILES[insulinType];
  if (direct) return direct;

  const normalized = String(insulinType).trim().toLowerCase().replace(/\s+/g, " ");
  const aliasKey = INSULIN_TYPE_ALIASES[normalized];
  if (aliasKey && INSULIN_PROFILES[aliasKey]) return INSULIN_PROFILES[aliasKey];

  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const matchedEntry = Object.entries(INSULIN_PROFILES).find(([name]) => {
    const profileKey = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return profileKey === compact || profileKey.includes(compact) || compact.includes(profileKey);
  });

  return matchedEntry?.[1] ?? null;
}

export function getInsulinCategory(insulinType) {
  return getInsulinProfile(insulinType)?.category ?? "Insulin";
}

export function getInsulinSource(insulinType) {
  const profile = getInsulinProfile(insulinType);
  if (!profile) return null;
  return {
    profile_version: profile.profile_version,
    source_last_reviewed: profile.source_last_reviewed,
    sources: profile.sources || [],
    notes: profile.notes || "",
  };
}

function getDoseUnits(dose) {
  const direct = Number(dose?.units);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const meal = Number(dose?.meal_units);
  const correction = Number(dose?.correction_units);
  const total = (Number.isFinite(meal) && meal > 0 ? meal : 0) + (Number.isFinite(correction) && correction > 0 ? correction : 0);
  return total > 0 ? total : 0;
}

function getDoseTime(dose) {
  return new Date(dose?.administered_at || dose?.administeredAt || dose?.created_at || dose?.created_date).getTime();
}

function getProfileTiming(profile, units) {
  const model = profile?.model || "peaked";
  const onset = Math.max(0, Number(profile?.onset) || 0);
  const duration = Math.max(onset + 1, Number(profile?.duration) || 240);
  const peak = Number(profile?.peak) || null;
  const shape = Math.max(2, Math.round(Number(profile?.shape) || 4));
  return { model, onset, peak, duration, shape };
}

// --- Gamma (Erlang) CDF / PDF for peaked insulins ---
// Erlang CDF with integer shape k: F(t) = 1 - e^{-x} * Σ_{j=0}^{k-1} x^j / j!, x = t/θ.
function erlangCDF(t, k, theta) {
  if (t <= 0 || theta <= 0) return 0;
  const x = t / theta;
  let sum = 1;
  let term = 1;
  for (let j = 1; j <= k - 1; j += 1) {
    term *= x / j;
    sum += term;
    if (!Number.isFinite(sum) || sum > 1e15) return 1;
  }
  const cdf = 1 - Math.exp(-x) * sum;
  return clamp(cdf, 0, 1);
}

function erlangPDF(t, k, theta) {
  if (t <= 0 || theta <= 0) return 0;
  const x = t / theta;
  // f(t) = x^(k-1) e^{-x} / (θ (k-1)!)  →  computed in log-space for stability.
  let logTerm = (k - 1) * Math.log(x) - x - Math.log(theta);
  for (let j = 2; j <= k - 1; j += 1) logTerm -= Math.log(j);
  return Math.exp(logTerm);
}

// Relative activity (glucose-lowering effect shape), normalized so peak ≈ 1.
function peakedActivityRel(t, peak, duration, shape) {
  if (t <= 0 || t >= duration) return 0;
  const k = shape;
  const theta = peak > 0 ? peak / (k - 1) : (duration * 0.3) / (k - 1);
  const peakPdf = erlangPDF(peak > 0 ? peak : (k - 1) * theta, k, theta);
  if (peakPdf <= 0) return 0;
  return clamp(erlangPDF(t, k, theta) / peakPdf, 0, 1);
}

// Broad plateau activity for near-peakless basal insulin. A near-constant
// release produces a roughly linear decline in remaining insulin across the
// effective duration (steady background activity, no pronounced peak).
function flatActivity(t, onset, duration) {
  if (t <= 0 || t >= duration) return 0;
  const rampEnd = Math.max(1, Math.min(onset, duration * 0.06));
  const taperStart = duration * 0.9;
  const floor = 1;
  if (t < rampEnd) return floor * (t / rampEnd);
  if (t < taperStart) return floor;
  const ratio = clamp((t - taperStart) / Math.max(1, duration - taperStart), 0, 1);
  return floor * (1 - ratio);
}

export function getRelativeActivityAtMinute(minute, timing) {
  const t = Math.max(0, Number(minute) || 0);
  const model = timing?.model || "peaked";
  const onset = Math.max(0, Number(timing?.onset) || 0);
  const duration = Math.max(onset + 1, Number(timing?.duration) || onset + 1);
  if (t <= 0 || t >= duration) return 0;
  if (model === "flat") return flatActivity(t, onset, duration);
  return peakedActivityRel(t, timing?.peak, duration, Number(timing?.shape) || 4);
}

// Resolve a dose into its component (profile, units) pairs. Premixed insulins
// decompose into their declared components; everything else is a single component.
function getDoseComponents(dose) {
  const profile = getInsulinProfile(dose?.insulin_type);
  const units = getDoseUnits(dose);
  if (!profile || units <= 0) return [];
  if (profile.model === "premix" && Array.isArray(profile.components)) {
    return profile.components
      .map((c) => ({ profile: getInsulinProfile(c.type), units: units * (Number(c.fraction) || 0) }))
      .filter((c) => c.profile && c.units > 0);
  }
  return [{ profile, units }];
}

// Build the per-component sampled curve (activity + area-based IOB).
function buildSingleComponentCurve(profile, units, start, step) {
  if (!profile || !units || units <= 0) return [];
  const timing = getProfileTiming(profile, units);
  const spanMin = Math.max(step, timing.duration);
  const points = [];
  for (let minute = 0; minute <= spanMin; minute += step) {
    points.push({ minute, time: start + minute * MINUTE_MS, activity: getRelativeActivityAtMinute(minute, timing) });
  }
  if (!points.length || points[points.length - 1].activity !== 0) {
    points.push({ minute: spanMin, time: start + spanMin * MINUTE_MS, activity: 0 });
  }

  let totalArea = 0;
  for (let index = 1; index < points.length; index += 1) {
    const minutes = points[index].minute - points[index - 1].minute;
    totalArea += ((points[index - 1].activity + points[index].activity) / 2) * minutes;
  }
  if (!(totalArea > 0)) {
    return points.map((point, index) => ({
      ...point,
      iobFraction: index === points.length - 1 ? 0 : 1,
      activeUnits: index === points.length - 1 ? 0 : units,
      activityUnitsPerMinute: 0,
    }));
  }

  let usedArea = 0;
  return points.map((point, index) => {
    if (index > 0) {
      const minutes = point.minute - points[index - 1].minute;
      usedArea += ((points[index - 1].activity + point.activity) / 2) * minutes;
    }
    const iobFraction = index === points.length - 1 ? 0 : clamp(1 - usedArea / totalArea, 0, 1);
    return {
      ...point,
      iobFraction,
      activeUnits: Math.max(0, units * iobFraction),
      activityUnitsPerMinute: (point.activity / totalArea) * units,
    };
  });
}

export function generateActivityCurve(dose, intervalMinutes = 5) {
  const start = getDoseTime(dose);
  const step = Math.max(1, Number(intervalMinutes) || 5);
  const components = getDoseComponents(dose);
  if (!components.length || !Number.isFinite(start)) return [];

  const componentCurves = components.map((c) => buildSingleComponentCurve(c.profile, c.units, start, step));
  const validCurves = componentCurves.filter((c) => c.length > 0);
  if (!validCurves.length) return [];
  if (validCurves.length === 1) return validCurves[0];

  // Premix: sum component contributions across a shared minute grid.
  const totalUnits = components.reduce((sum, c) => sum + c.units, 0) || 0;
  const byMinute = new Map();
  for (const curve of validCurves) {
    for (const point of curve) {
      const existing = byMinute.get(point.minute) || { minute: point.minute, time: point.time, activeUnits: 0, aupm: 0 };
      existing.activeUnits += point.activeUnits;
      existing.aupm += point.activityUnitsPerMinute;
      byMinute.set(point.minute, existing);
    }
  }

  const minutes = [...byMinute.keys()].sort((a, b) => a - b);
  let maxAupm = 0;
  for (const m of minutes) {
    const v = byMinute.get(m);
    if (v.aupm > maxAupm) maxAupm = v.aupm;
  }

  return minutes.map((m) => {
    const v = byMinute.get(m);
    return {
      minute: m,
      time: v.time,
      activity: maxAupm > 0 ? v.aupm / maxAupm : 0,
      iobFraction: totalUnits > 0 ? v.activeUnits / totalUnits : 0,
      activeUnits: v.activeUnits,
      activityUnitsPerMinute: v.aupm,
    };
  });
}

function interpolateCurveValue(curve, atTime, key) {
  if (!Array.isArray(curve) || !curve.length || !Number.isFinite(atTime)) return 0;
  if (atTime < curve[0].time || atTime > curve[curve.length - 1].time) return 0;
  for (let index = 0; index < curve.length - 1; index += 1) {
    const current = curve[index];
    const next = curve[index + 1];
    if (current.time > atTime || next.time < atTime) continue;
    const span = next.time - current.time;
    const ratio = span > 0 ? (atTime - current.time) / span : 0;
    const value = Number(current[key]) + (Number(next[key]) - Number(current[key])) * ratio;
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  const value = Number(curve[curve.length - 1][key]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getSteadyBasalIOB(dose, atTime = Date.now()) {
  // Basal insulin is now modeled with the same per-dose plateau curve as all
  // other insulins (gradual background decline), so this simply delegates to
  // the unified IOB calculation. Kept for backward compatibility.
  return getDoseIOB(dose, atTime);
}

export function getDoseIOB(dose, atTime = Date.now()) {
  const start = getDoseTime(dose);
  if (!Number.isFinite(start) || !Number.isFinite(atTime) || atTime < start) return 0;
  return interpolateCurveValue(generateActivityCurve(dose), atTime, "activeUnits");
}

export function getDoseRelativeActivity(dose, atTime = Date.now()) {
  const start = getDoseTime(dose);
  if (!Number.isFinite(start) || !Number.isFinite(atTime) || atTime < start) return 0;
  return clamp(interpolateCurveValue(generateActivityCurve(dose), atTime, "activity"), 0, 1);
}

export function isBolusInsulinType(insulinType) {
  const category = getInsulinCategory(insulinType);
  return category === "Rapid-Acting" || category === "Short-Acting";
}

export function isIntermediateInsulinType(insulinType) {
  return getInsulinCategory(insulinType) === "Intermediate-Acting";
}

export function isBasalInsulinType(insulinType) {
  const category = getInsulinCategory(insulinType);
  return category === "Long-Acting" || category === "Ultra-Long-Acting";
}

export function isPremixedInsulinType(insulinType) {
  return getInsulinCategory(insulinType) === "Premixed";
}

export function getTotalBolusIOB(doses, atTime = Date.now()) {
  return (Array.isArray(doses) ? doses : []).reduce((sum, dose) => {
    if (!isBolusInsulinType(dose?.insulin_type)) return sum;
    return sum + getDoseIOB(dose, atTime);
  }, 0);
}

export function getTotalIntermediateIOB(doses, atTime = Date.now()) {
  return (Array.isArray(doses) ? doses : []).reduce((sum, dose) => {
    if (!isIntermediateInsulinType(dose?.insulin_type)) return sum;
    return sum + getDoseIOB(dose, atTime);
  }, 0);
}

export function getTotalBasalActivity(doses, atTime = Date.now()) {
  return (Array.isArray(doses) ? doses : []).reduce((sum, dose) => {
    if (!isBasalInsulinType(dose?.insulin_type)) return sum;
    return sum + getDoseRelativeActivity(dose, atTime);
  }, 0);
}

export function getTotalIOB(doses, atTime = Date.now()) {
  return (Array.isArray(doses) ? doses : []).reduce((sum, dose) => sum + getDoseIOB(dose, atTime), 0);
}

// Derive a synthetic timing for a premixed insulin from its components so the
// status phase/label reflects the combined curve (bolus peak + basal duration).
function getPremixTiming(profile) {
  let onset = Infinity;
  let peak = null;
  let duration = 0;
  for (const c of profile?.components || []) {
    const cp = getInsulinProfile(c.type);
    if (!cp) continue;
    const ct = getProfileTiming(cp, 0);
    onset = Math.min(onset, ct.onset);
    duration = Math.max(duration, ct.duration);
    if (ct.model === "peaked" && ct.peak != null) {
      peak = peak == null ? ct.peak : Math.min(peak, ct.peak);
    }
  }
  return {
    model: "peaked",
    onset: Number.isFinite(onset) ? onset : 0,
    peak,
    duration: duration || 240,
    shape: 4,
  };
}

export function getDoseStatus(dose, atTime = Date.now()) {
  const profile = getInsulinProfile(dose?.insulin_type);
  const units = getDoseUnits(dose);
  const start = getDoseTime(dose);
  if (!profile || !units || !Number.isFinite(start)) {
    return { phase: "expired", label: "Unavailable", activity: 0, iob: 0 };
  }
  if (atTime < start) {
    return { phase: "scheduled", label: "Scheduled", activity: 0, iob: 0 };
  }

  const timing = profile.model === "premix" ? getPremixTiming(profile) : getProfileTiming(profile, units);
  const elapsed = (atTime - start) / MINUTE_MS;
  const activity = getRelativeActivityAtMinute(elapsed, timing);
  const iob = getDoseIOB(dose, atTime);

  if (elapsed >= timing.duration || iob <= 0.01) {
    return { phase: "expired", label: "No longer active", activity: 0, iob: 0 };
  }

  if (timing.model === "flat") {
    if (elapsed < timing.onset) return { phase: "waiting", label: "Absorbing gently", activity, iob };
    if (elapsed < timing.duration * 0.8) return { phase: "steady", label: "Active in the background", activity, iob };
    if (elapsed < timing.duration) return { phase: "declining", label: "Gently winding down", activity, iob };
    return { phase: "low_activity", label: "Lingering gently", activity, iob };
  }

  const peak = timing.peak || timing.duration * 0.4;
  if (elapsed < timing.onset) return { phase: "waiting", label: "Absorbing — not yet active", activity, iob };
  if (elapsed < peak * 0.85) return { phase: "rising", label: "Rising toward peak", activity, iob };
  if (elapsed < peak) return { phase: "near_peak", label: "Near peak activity", activity, iob };
  if (Math.abs(elapsed - peak) <= 15) return { phase: "peak", label: "Peak activity", activity, iob };
  if (elapsed < timing.duration) return { phase: "declining", label: "Activity declining", activity, iob };
  return { phase: "low_activity", label: "Lingering gently", activity, iob };
}

export function getDoseTimingInfo(dose, atTime = Date.now()) {
  const profile = getInsulinProfile(dose?.insulin_type);
  const units = getDoseUnits(dose);
  const start = getDoseTime(dose);
  if (!profile || !units || !Number.isFinite(start) || !Number.isFinite(atTime)) {
    return { totalDurationMin: 0, elapsedMin: 0, remainingMin: 0, progress: 0, isExpired: true };
  }

  const timing = getProfileTiming(profile, units);
  const totalDurationMin = timing.duration;
  const elapsedMin = atTime >= start ? (atTime - start) / MINUTE_MS : 0;
  const remainingMin = Math.max(0, totalDurationMin - elapsedMin);
  const progress = totalDurationMin > 0 ? Math.min(1, elapsedMin / totalDurationMin) : 0;

  return {
    totalDurationMin,
    elapsedMin,
    remainingMin,
    progress,
    isExpired: elapsedMin >= totalDurationMin,
  };
}