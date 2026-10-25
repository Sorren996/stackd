// Availability gate for the follower's estimated active RAPID-ACTING insulin
// figure.
//
// This is presentation logic, not a security control: the server already
// decides `dose_math_available` from the sharer's confirmed plan. What this
// gate guarantees is that an unknown, unconfirmed or non-computable estimate
// is reported as UNAVAILABLE — it is never floored to a misleading 0.0 u.
//
// It lives under src/lib so the browser bundle can use it (frontend code
// cannot import from base44/, which is server-side) and so the Node test
// runner can exercise it directly. Pure — no imports, no side effects.

/**
 * @param {unknown} value — the computed active insulin, or null when none could be computed
 * @param {boolean} doseMathAvailable — the sharer's plan is confirmed
 * @param {unknown} rapidDoseCount — how many rapid-acting doses the estimate rests on
 * @returns {{ available: boolean, reason: string|null, value: number|null, isZero: boolean }}
 */
export function describeActiveInsulinEstimate(value, doseMathAvailable, rapidDoseCount) {
  if (!doseMathAvailable) {
    return { available: false, reason: "unconfirmed_plan", value: null, isZero: false };
  }
  const count = Number(rapidDoseCount);
  if (!Number.isFinite(count) || count <= 0) {
    return { available: false, reason: "no_rapid_doses", value: null, isZero: false };
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) {
    return { available: false, reason: "not_computable", value: null, isZero: false };
  }
  const rounded = Math.round(v * 10) / 10;
  return { available: true, reason: null, value: rounded, isZero: rounded < 0.05 };
}

/** Short, neutral label for the follower card. Never advice, never a dose. */
export function describeActiveInsulinLabel(estimate) {
  if (!estimate || !estimate.available) return "Unavailable";
  if (estimate.isZero) return "None active";
  return `${estimate.value.toFixed(1)} u`;
}