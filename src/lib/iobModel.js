// Stackd Finite-DIA Beta-Curve IOB Model — single source of truth.
//
// The curve is UNCHANGED from the previously validated beta residual; what
// changed is only its ENDPOINT BEHAVIOUR: there is no longer any "clear it
// early" threshold. A dose's modelled remainder stays a real positive number
// until the model's own endpoint is reached, and is exactly 0 at and after it.
//
// Math (rapid-acting analogs):
//   x = t / DIA, clamped to [0,1]
//   IOB(t)     = D * [ (1-x)^7 + 7x(1-x)^6 + 21x²(1-x)^5 ]
//   Activity(t)= D * 105 * x² * (1-x)^4 / DIA   (units per minute)
//
// Properties:
//   IOB(0) = D, IOB(DIA) = 0.0 exactly, monotonic decreasing,
//   no sub-unit truncation anywhere, cumulative activity + IOB(t) = D.
//
// ZERO MEANS "THE MODEL REACHED ITS ENDPOINT", never "the body has certainly
// finished with this insulin". It is an estimate from a population-level
// shape, not a measurement.
//
// Sources: FDA NovoLog (insulin aspart) prescribing information rev 9/2024
// (duration 3–5h, peak 1–3h); Walsh/Roberts/Bailey 2011 J Diabetes Sci
// Technol DIA guidance; Mayo/Harvard/Johns Hopkins patient-education tables.
//
// LIMITATION, pending replacement: the dose-tiered end points below are NOT
// clinically validated dose-duration values, and they are shared by every
// rapid-acting analog profile (including the faster-acting ones). They are
// kept unchanged here so this change stays bounded to endpoint behaviour.

// Peak coefficient of x²(1-x)^4 — occurs at x = 1/3 (i.e. t = DIA/3).
const BETA_PEAK_COEF = (1 / 9) * Math.pow(2 / 3, 4); // 16/729

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Dose-tiered DIA (dose size scales duration)
// ---------------------------------------------------------------------------
// 1–4u  → 210 min (3h30m), peak ~70 min
// 5–14u → 240 min (4h),    peak ~80 min
// 15–24u→ 270 min (4h30m), peak ~90 min
// 25u+  → 300 min (5h),    peak ~100 min
// Peak = DIA/3, rounded to whole minutes.
export function getDoseTierDIA(units) {
  const u = Math.max(0, safeNumber(units));
  if (u >= 25) return 300;
  if (u >= 15) return 270;
  if (u >= 5) return 240;
  return 210;
}

export function getDoseTierPeak(units) {
  return Math.round(getDoseTierDIA(units) / 3);
}

// ---------------------------------------------------------------------------
// Beta-curve math
// ---------------------------------------------------------------------------

/**
 * IOB fraction remaining at elapsed time t (minutes) for a dose with the
 * given DIA (minutes). Returns 1.0 at t=0, 0.0 at t>=DIA, monotonic decreasing.
 */
export function betaIOBFraction(tMinutes, diaMinutes) {
  const t = Math.max(0, safeNumber(tMinutes));
  const dia = Math.max(1, safeNumber(diaMinutes, 210));
  if (t <= 0) return 1;
  if (t >= dia) return 0;
  const x = t / dia;
  const oneMinusX = 1 - x;
  return (
    Math.pow(oneMinusX, 7) +
    7 * x * Math.pow(oneMinusX, 6) +
    21 * x * x * Math.pow(oneMinusX, 5)
  );
}

/**
 * Insulin activity rate at elapsed time t (units per minute). Zero outside
 * [0, DIA]. Integrates to exactly D over [0, DIA].
 */
export function betaActivityRate(tMinutes, diaMinutes, doseUnits) {
  const t = Math.max(0, safeNumber(tMinutes));
  const dia = Math.max(1, safeNumber(diaMinutes, 210));
  const d = Math.max(0, safeNumber(doseUnits));
  if (t <= 0 || t >= dia || d <= 0) return 0;
  const x = t / dia;
  const oneMinusX = 1 - x;
  return (d * 105 * x * x * Math.pow(oneMinusX, 4)) / dia;
}

/**
 * Peak-normalized activity (0–1) for chart rendering — same gentle rise →
 * clear peak (at DIA/3) → long gradual tail shape, terminating exactly at DIA.
 * Independent of dose size and DIA (pure shape).
 */
export function betaActivityNormalized(tMinutes, diaMinutes) {
  const t = Math.max(0, safeNumber(tMinutes));
  const dia = Math.max(1, safeNumber(diaMinutes, 210));
  if (t <= 0 || t >= dia) return 0;
  const x = t / dia;
  const oneMinusX = 1 - x;
  const raw = x * x * Math.pow(oneMinusX, 4);
  return BETA_PEAK_COEF > 0 ? raw / BETA_PEAK_COEF : 0;
}

/**
 * IOB in real units at elapsed time t.
 *
 * Returns the modelled remainder with NO early-zero threshold: a positive
 * remainder below 1u is a positive remainder. Exactly 0 at/after the model's
 * endpoint, and never negative or NaN.
 */
export function getBetaIOB(doseUnits, tMinutes, diaMinutes) {
  const d = Math.max(0, safeNumber(doseUnits));
  const raw = d * betaIOBFraction(tMinutes, diaMinutes);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw;
}

// ---------------------------------------------------------------------------
// Time formatters (time, not units — unit formatting lives in remainingInsulin)
// ---------------------------------------------------------------------------

/**
 * Countdown to the model's own endpoint: always exactly DIA − elapsed.
 * It reaches 0 at the same moment the curve reaches 0.
 * Returns minutes (0 when elapsed >= DIA, and for a future dose: elapsed < 0
 * gives the full duration back).
 */
export function getClearanceMinutes(doseUnits, elapsedMinutes) {
  const dia = getDoseTierDIA(doseUnits);
  const elapsed = safeNumber(elapsedMinutes);
  return Math.max(0, dia - Math.max(0, elapsed));
}

/**
 * Format a minute count as "Xh Ym" (e.g. "3h 30m", "45m", "4h").
 */
export function formatClearance(minutes) {
  const m = Math.max(0, Math.round(safeNumber(minutes)));
  if (m <= 0) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Validation suite (self-check of the invariants above)
// ---------------------------------------------------------------------------
export function runIOBValidation() {
  const checks = [];
  const pass = (name, cond) => checks.push({ name, passed: Boolean(cond) });

  const dose = 6;
  const dia = getDoseTierDIA(dose); // 240 for 6u
  const step = 5;

  pass("IOB(0) = dose", Math.abs(getBetaIOB(dose, 0, dia) - dose) < 1e-9);
  pass("IOB(DIA) = 0.0 exactly", getBetaIOB(dose, dia, dia) === 0);

  let monotonic = true;
  let prev = getBetaIOB(dose, 0, dia);
  for (let t = step; t <= dia; t += step) {
    const cur = getBetaIOB(dose, t, dia);
    if (cur > prev + 1e-12) { monotonic = false; break; }
    prev = cur;
  }
  pass("Monotonic decreasing", monotonic);

  // No early truncation: every positive remainder below 1u is preserved.
  const subUnit = [0.00001, 0.01, 0.49, 0.5, 0.99];
  let noTruncation = true;
  for (const frac of subUnit) {
    const t = frac * dia;
    if (!(getBetaIOB(dose, t, dia) > 0)) { noTruncation = false; break; }
  }
  pass("Sub-unit remainders preserved (no 0.49u cutoff)", noTruncation);

  pass("Non-finite dose is zero", getBetaIOB(Number.NaN, 60, dia) === 0);
  pass("Negative dose is zero", getBetaIOB(-4, 60, dia) === 0);
  pass("Past the endpoint is zero", getBetaIOB(dose, dia + 1, dia) === 0);

  let countdown = true;
  for (const elapsed of [0, 30, 120, 200, dia]) {
    if (getClearanceMinutes(dose, elapsed) !== Math.max(0, dia - elapsed)) { countdown = false; break; }
  }
  pass("Countdown = DIA − elapsed", countdown);

  return { passed: checks.every((c) => c.passed), checks };
}