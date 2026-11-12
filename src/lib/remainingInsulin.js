// Presentation of ESTIMATED REMAINING INSULIN — kept separate from the model.
//
// Why this file exists: the bolus model is a population-level estimate, not a
// measurement. Showing "0.4u" implies a precision it does not have, so a
// positive remainder below one unit is displayed as "1u" — and the model's own
// value is never changed. The display rule lives ONLY here; calculations,
// stored values, totals, stacking assessment and projections keep the raw
// numbers.
//
// Scope: remaining-insulin estimates only. Logged dose amounts, dosing inputs,
// prescribed plans and glucose values are NOT formatted with these helpers.

/** Always-visible context for a remaining-insulin figure. */
export const REMAINING_ESTIMATE_TITLE = "Estimated remaining insulin";
/** Always-visible short chip ("Estimated"). */
export const REMAINING_ESTIMATE_BADGE = "Estimated";
/** Quiet explanation of the sub-unit rule, shown once per surface. */
export const REMAINING_ESTIMATE_NOTE =
  "Amounts below 1u are shown as 1u. Calculations retain the modeled amount.";

function safeRemaining(units) {
  const n = Number(units);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** True only at the model's own endpoint — never for a small positive value. */
export function isModelZero(units) {
  return safeRemaining(units) === 0;
}

/** The modelled amount, unrounded and unmutated. */
export function modelRemaining(units) {
  return safeRemaining(units);
}

/**
 * Number-only field: "0" at the model endpoint, "1" for any positive
 * remainder under 1u, otherwise the existing one-decimal form.
 */
export function formatRemainingValue(units) {
  const remaining = safeRemaining(units);
  if (remaining === 0) return "0";
  if (remaining < 1) return "1";
  return remaining.toFixed(1);
}

/** Number with the unit suffix: "0u", "1u", "1.4u". */
export function formatRemaining(units) {
  return `${formatRemainingValue(units)}u`;
}

/** With words: "0u remaining", "1u remaining", "1.4u remaining". */
export function formatRemainingLong(units) {
  return `${formatRemaining(units)} remaining`;
}