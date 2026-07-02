// Copy this file to: src/lib/insulinPharmacology.js
// IOB is modeled from remaining area under the activity curve, not from curve height.

const MINUTE_MS = 60 * 1000;

export const INSULIN_PROFILES = {
  "Fiasp": {
    category: "Rapid-Acting",
    onsetMin: 5,
    onsetMax: 15,
    peakMin: 45,
    peakMax: 90,
    durationMin: 180,
    durationMax: 300,
    color: "#22d3ee",
  },
  "Lyumjev": {
    category: "Rapid-Acting",
    onsetMin: 5,
    onsetMax: 15,
    peakMin: 45,
    peakMax: 90,
    durationMin: 180,
    durationMax: 300,
    color: "#06b6d4",
  },
  "NovoLog": {
    category: "Rapid-Acting",
    onsetMin: 10,
    onsetMax: 20,
    peakMin: 60,
    peakMax: 120,
    durationMin: 180,
    durationMax: 300,
    color: "#38bdf8",
  },
  "Humalog": {
    category: "Rapid-Acting",
    onsetMin: 10,
    onsetMax: 20,
    peakMin: 60,
    peakMax: 120,
    durationMin: 180,
    durationMax: 300,
    color: "#0ea5e9",
  },
  "Apidra": {
    category: "Rapid-Acting",
    onsetMin: 10,
    onsetMax: 20,
    peakMin: 60,
    peakMax: 120,
    durationMin: 180,
    durationMax: 300,
    color: "#60a5fa",
  },
  "Regular": {
    category: "Short-Acting",
    onsetMin: 30,
    onsetMax: 60,
    peakMin: 120,
    peakMax: 240,
    durationMin: 300,
    durationMax: 480,
    color: "#818cf8",
  },
  "NPH": {
    category: "Intermediate-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: 240,
    peakMax: 720,
    durationMin: 720,
    durationMax: 1080,
    color: "#a78bfa",
  },
  "Lantus": {
    category: "Long-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: null,
    peakMax: null,
    durationMin: 1200,
    durationMax: 1440,
    color: "#2dd4bf",
  },
  "Basaglar": {
    category: "Long-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: null,
    peakMax: null,
    durationMin: 1200,
    durationMax: 1440,
    color: "#14b8a6",
  },
  "Levemir": {
    category: "Long-Acting",
    onsetMin: 60,
    onsetMax: 180,
    peakMin: 360,
    peakMax: 480,
    durationMin: 720,
    durationMax: 1440,
    color: "#34d399",
  },
  "Tresiba": {
    category: "Ultra-Long-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: null,
    peakMax: null,
    durationMin: 2520,
    durationMax: 3000,
    color: "#10b981",
  },
  "Toujeo": {
    category: "Ultra-Long-Acting",
    onsetMin: 360,
    onsetMax: 360,
    peakMin: null,
    peakMax: null,
    durationMin: 2160,
    durationMax: 2160,
    color: "#059669",
  },
};

const DURATION_MULTIPLIER_POINTS = [
  { units: 0, multiplier: 0.75 },
  { units: 5, multiplier: 0.75 },
  { units: 15, multiplier: 1.0 },
  { units: 30, multiplier: 1.2 },
  { units: 50, multiplier: 1.4 },
  { units: 75, multiplier: 1.6 },
];

const PEAK_MULTIPLIER_POINTS = [
  { units: 0, multiplier: 0.9 },
  { units: 5, multiplier: 0.9 },
  { units: 15, multiplier: 1.0 },
  { units: 30, multiplier: 1.1 },
  { units: 50, multiplier: 1.2 },
  { units: 75, multiplier: 1.3 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function midpoint(min, max, fallback = 0) {
  const a = Number(min);
  const b = Number(max);
  if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  if (Number.isFinite(a)) return a;
  if (Number.isFinite(b)) return b;
  return fallback;
}

export function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (safeMinutes < 60) return `${safeMinutes}m`;

  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

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

function getDoseUnits(dose) {
  const direct = Number(dose?.units);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const meal = Number(dose?.meal_units);
  const correction = Number(dose?.correction_units);
  const total = (Number.isFinite(meal) && meal > 0 ? meal : 0) + (Number.isFinite(correction) && correction > 0 ? correction : 0);
  return total > 0 ? total : 0;
}

function getProfileTiming(profile, units) {
  const onset = Math.max(0, midpoint(profile?.onsetMin, profile?.onsetMax, 0));
  const durationBase = Math.max(onset + 1, midpoint(profile?.durationMin, profile?.durationMax, 240));
  const duration = Math.max(onset + 1, durationBase * getDoseDurationMultiplier(units));
  const hasPeak = Number.isFinite(profile?.peakMin) && Number.isFinite(profile?.peakMax);
  const peakBase = hasPeak ? midpoint(profile.peakMin, profile.peakMax, (onset + duration) / 2) : null;
  const peak = hasPeak ? clamp(peakBase * getDosePeakMultiplier(units), onset + 1, duration - 1) : null;

  return { onset, peak, duration, hasPeak };
}

export function getRelativeActivityAtMinute(minute, timing) {
  const t = Math.max(0, Number(minute) || 0);
  const onset = Math.max(0, Number(timing?.onset) || 0);
  const duration = Math.max(onset + 1, Number(timing?.duration) || onset + 1);
  const hasPeak = Boolean(timing?.hasPeak && Number.isFinite(timing?.peak));

  if (t <= 0 || t >= duration) return 0;

  if (!hasPeak) {
    const rampEnd = Math.min(duration * 0.18, Math.max(onset, 1));
    const taperStart = duration * 0.78;

    if (t <= rampEnd) {
      const ratio = clamp(t / Math.max(1, rampEnd), 0, 1);
      return 0.72 * (1 - Math.cos(Math.PI * ratio)) / 2;
    }

    if (t >= taperStart) {
      const ratio = clamp((t - taperStart) / Math.max(1, duration - taperStart), 0, 1);
      return 0.72 * (1 + Math.cos(Math.PI * ratio)) / 2;
    }

    return 0.72;
  }

  const peak = clamp(Number(timing.peak), onset + 1, duration - 1);

  if (t < onset) {
    const ratio = clamp(t / Math.max(1, onset), 0, 1);
    return 0.08 * (1 - Math.cos(Math.PI * ratio)) / 2;
  }

  if (t <= peak) {
    const ratio = clamp((t - onset) / Math.max(1, peak - onset), 0, 1);
    return 0.08 + 0.92 * (1 - Math.cos(Math.PI * ratio)) / 2;
  }

  const ratio = clamp((t - peak) / Math.max(1, duration - peak), 0, 1);
  return (1 + Math.cos(Math.PI * ratio)) / 2;
}

export function generateActivityCurve(dose, intervalMinutes = 5) {
  const profile = INSULIN_PROFILES[dose?.insulin_type];
  const units = getDoseUnits(dose);
  const start = new Date(dose?.administered_at).getTime();
  const step = Math.max(1, Number(intervalMinutes) || 5);

  if (!profile || !units || !Number.isFinite(start)) return [];

  const timing = getProfileTiming(profile, units);
  const points = [];

  for (let minute = 0; minute < timing.duration; minute += step) {
    points.push({
      time: start + minute * MINUTE_MS,
      minute,
      activity: getRelativeActivityAtMinute(minute, timing),
    });
  }

  if (!points.length || points[points.length - 1].minute !== timing.duration) {
    points.push({
      time: start + timing.duration * MINUTE_MS,
      minute: timing.duration,
      activity: 0,
    });
  }

  let totalActivityArea = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const minutes = Math.max(0, (current.time - previous.time) / MINUTE_MS);
    totalActivityArea += ((previous.activity + current.activity) / 2) * minutes;
  }

  if (!Number.isFinite(totalActivityArea) || totalActivityArea <= 0) {
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
      const previous = points[index - 1];
      const minutes = Math.max(0, (point.time - previous.time) / MINUTE_MS);
      usedArea += ((previous.activity + point.activity) / 2) * minutes;
    }

    const iobFraction = index === points.length - 1 ? 0 : clamp(1 - usedArea / totalActivityArea, 0, 1);
    const activeUnits = Math.max(0, units * iobFraction);

    return {
      ...point,
      iobFraction,
      activeUnits,
      activityUnitsPerMinute: (point.activity / totalActivityArea) * units,
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

export function getDoseIOB(dose, atTime = Date.now()) {
  const start = new Date(dose?.administered_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(atTime) || atTime < start) return 0;
  return interpolateCurveValue(generateActivityCurve(dose), atTime, "activeUnits");
}

export function getDoseRelativeActivity(dose, atTime = Date.now()) {
  const start = new Date(dose?.administered_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(atTime) || atTime < start) return 0;
  return clamp(interpolateCurveValue(generateActivityCurve(dose), atTime, "activity"), 0, 1);
}

export function isBolusInsulinType(insulinType) {
  const category = INSULIN_PROFILES[insulinType]?.category;
  return category === "Rapid-Acting" || category === "Short-Acting";
}

export function isIntermediateInsulinType(insulinType) {
  return INSULIN_PROFILES[insulinType]?.category === "Intermediate-Acting";
}

export function isBasalInsulinType(insulinType) {
  const category = INSULIN_PROFILES[insulinType]?.category;
  return category === "Long-Acting" || category === "Ultra-Long-Acting";
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

export function getDoseStatus(dose, atTime = Date.now()) {
  const profile = INSULIN_PROFILES[dose?.insulin_type];
  const units = getDoseUnits(dose);
  const start = new Date(dose?.administered_at).getTime();

  if (!profile || !units || !Number.isFinite(start)) {
    return { phase: "expired", label: "Unavailable", activity: 0, iob: 0 };
  }

  if (atTime < start) {
    return { phase: "scheduled", label: "Scheduled", activity: 0, iob: 0 };
  }

  const elapsed = (atTime - start) / MINUTE_MS;
  const timing = getProfileTiming(profile, units);
  const activity = getRelativeActivityAtMinute(elapsed, timing);
  const iob = getDoseIOB(dose, atTime);

  if (elapsed >= timing.duration || iob <= 0.01) {
    return { phase: "expired", label: "No longer active", activity: 0, iob: 0 };
  }

  if (!timing.hasPeak) {
    if (elapsed < timing.onset) return { phase: "waiting", label: "Absorbing - not yet active", activity, iob };
    if (elapsed > timing.duration * 0.78) return { phase: "low_activity", label: "Low residual activity", activity, iob };
    return { phase: "steady", label: "Active - steady coverage", activity, iob };
  }

  if (elapsed < timing.onset) return { phase: "waiting", label: "Absorbing - not yet active", activity, iob };
  if (elapsed < timing.peak * 0.85) return { phase: "rising", label: "Rising toward peak", activity, iob };
  if (elapsed < timing.peak) return { phase: "near_peak", label: "Near peak activity", activity, iob };
  if (Math.abs(elapsed - timing.peak) <= 15) return { phase: "peak", label: "Peak activity", activity, iob };
  if (elapsed > timing.duration * 0.85) return { phase: "low_activity", label: "Low residual activity", activity, iob };
  return { phase: "declining", label: "Activity declining", activity, iob };
}
