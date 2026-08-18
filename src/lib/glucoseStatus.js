// Centralized glucose-status colors, classification, and reference-line
// constants. High = amber, Low = red, In-range = sage green.
// Used across all glucose UI so status colors stay consistent everywhere.

export const GLUCOSE_STATUS_COLORS = {
  inRange: "#5ba88a", // muted sage green
  high: "#d4a056", // amber
  low: "#e07a6b", // warm red
};

// Configurable "High" glucose reference line.
export const HIGH_REFERENCE_DEFAULT = 250;
export const HIGH_REFERENCE_MIN = 140;
export const HIGH_REFERENCE_MAX = 400;
export const HIGH_REFERENCE_STEP = 10;

// Fixed low glucose reference line.
export const FIXED_LOW_REFERENCE = 40;

export function classifyGlucose(value, targetLow, targetHigh) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < targetLow) return "low";
  if (value > targetHigh) return "high";
  return "inRange";
}

export function getGlucoseColor(value, targetLow, targetHigh) {
  const status = classifyGlucose(value, targetLow, targetHigh);
  if (status === "unknown") return GLUCOSE_STATUS_COLORS.inRange;
  return GLUCOSE_STATUS_COLORS[status];
}

export function getGlucoseStatusLabel(value, targetLow, targetHigh) {
  const status = classifyGlucose(value, targetLow, targetHigh);
  if (status === "low") return "Below comfort zone";
  if (status === "high") return "Above comfort zone";
  if (status === "inRange") return "In comfort zone";
  return "No data";
}

// Read the configurable High reference from localStorage (cache of server setting).
export function readHighReference() {
  if (typeof window === "undefined") return HIGH_REFERENCE_DEFAULT;
  const v = Number(window.localStorage.getItem("high_glucose_reference"));
  if (!Number.isFinite(v)) return HIGH_REFERENCE_DEFAULT;
  const clamped = Math.max(HIGH_REFERENCE_MIN, Math.min(HIGH_REFERENCE_MAX, v));
  return Math.round(clamped / HIGH_REFERENCE_STEP) * HIGH_REFERENCE_STEP;
}

// Build the list of selectable High reference values (140–400 step 10).
export function getHighReferenceOptions() {
  const options = [];
  for (let v = HIGH_REFERENCE_MIN; v <= HIGH_REFERENCE_MAX; v += HIGH_REFERENCE_STEP) {
    options.push(v);
  }
  return options;
}