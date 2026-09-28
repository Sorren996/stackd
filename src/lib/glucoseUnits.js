/**
 * Glucose unit conversion — display layer only.
 *
 * ALL internal logic, storage, and calculations remain in mg/dL.
 * This utility converts only at the render/display layer. One source of
 * truth: the setting only changes presentation, never the underlying data.
 *
 * Conversion: mmol/L = mg/dL ÷ 18 (standard convention).
 * mmol/L values always display with exactly ONE decimal place.
 *
 * Rounding accuracy: always convert and round ONCE from the raw mg/dL value.
 * Never compute a displayed delta from already-rounded displayed values.
 */

const STORAGE_KEY = "glucose_units";
const EVENT_NAME = "glucose-units-updated";

/** Read the current display unit preference. Defaults to "mg/dL". */
export function getGlucoseUnits() {
  if (typeof window === "undefined") return "mg/dL";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "mmol/L" ? "mmol/L" : "mg/dL";
}

/** Save the preference to localStorage and dispatch a global event so
 *  every glucose display re-renders immediately. */
export function setGlucoseUnits(units) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, units);
  window.dispatchEvent(new Event(EVENT_NAME));
  // Also dispatch the settings events that graphs already listen for,
  // so reference labels and chart ticks refresh.
  window.dispatchEvent(new Event("target-range-updated"));
  window.dispatchEvent(new Event("insulin-settings-updated"));
}

/** Convenience boolean. */
export function isMmolMode() {
  return getGlucoseUnits() === "mmol/L";
}

/**
 * Convert a raw mg/dL value to the display unit, rounded once.
 * Returns a Number (not a string). Returns null for invalid input.
 *  - mg/dL mode: returns the rounded integer value.
 *  - mmol/L mode: returns the value ÷ 18, rounded to 1 decimal.
 */
export function convertGlucose(mgdl) {
  const n = Number(mgdl);
  if (!Number.isFinite(n)) return null;
  if (!isMmolMode()) return Math.round(n);
  return Math.round((n / 18) * 10) / 10;
}

/**
 * Format a glucose VALUE for display.
 *  - mg/dL: "190" (integer, no decimals)
 *  - mmol/L: "10.6" (always 1 decimal)
 */
export function formatGlucose(mgdl) {
  const n = Number(mgdl);
  if (!Number.isFinite(n)) return "-";
  if (!isMmolMode()) return String(Math.round(n));
  return (Math.round((n / 18) * 10) / 10).toFixed(1);
}

/**
 * Format a glucose DELTA for display (e.g., rise from pre-meal).
 * Computes from the RAW mg/dL delta, then converts and rounds once.
 *  - mg/dL: "+40" (signed integer)
 *  - mmol/L: "+2.2" (signed, 1 decimal)
 */
export function formatGlucoseDelta(mgdlDelta) {
  const n = Number(mgdlDelta);
  if (!Number.isFinite(n)) return "";
  const sign = n > 0 ? "+" : "";
  if (!isMmolMode()) return `${sign}${Math.round(n)}`;
  const mmol = Math.round((n / 18) * 10) / 10;
  return `${sign}${mmol.toFixed(1)}`;
}

/**
 * Format a glucose ABSOLUTE delta (no sign).
 *  - mg/dL: "40"
 *  - mmol/L: "2.2"
 */
export function formatGlucoseAbsDelta(mgdlDelta) {
  const n = Number(Math.abs(mgdlDelta));
  if (!Number.isFinite(n)) return "";
  if (!isMmolMode()) return String(Math.round(n));
  return (Math.round((n / 18) * 10) / 10).toFixed(1);
}

/** Unit label string for display: "mg/dL" or "mmol/L". */
export function glucoseUnitLabel() {
  return isMmolMode() ? "mmol/L" : "mg/dL";
}

/**
 * Delta unit word for copy: "points" in mg/dL mode, "mmol/L" in mmol/L mode.
 * Used in phrases like "Rose 40 points so far" → "Rose 2.2 mmol/L so far".
 */
export function glucoseDeltaUnit() {
  return isMmolMode() ? "mmol/L" : "points";
}

/** Hook helper: subscribe to glucose-units-updated events.
 *  Returns a cleanup function. */
export function onGlucoseUnitsChange(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}