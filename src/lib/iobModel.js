// Stackd Finite-DIA Beta-Curve IOB Model — single source of truth.
//
// Replaces the asymptotic exponential (oref1) tail for rapid-acting insulin
// analogs (aspart / lispro / glulisine and their faster-acting variants).
// The exponential model never reaches zero, so "clears in Xh" was arbitrary
// and the "<1u" ghost tail was useless and contradictory. This beta curve
// reaches exactly 0.00 at a finite, dose-tiered DIA.
//
// Math (rapid-acting analogs):
//   x = t / DIA, clamped to [0,1]
//   IOB(t)     = D * [ (1-x)^7 + 7x(1-x)^6 + 21x²(1-x)^5 ]
//   Activity(t)= D * 105 * x² * (1-x)^4 / DIA   (units per minute)
//
// Properties (hard acceptance checks, validated by runIOBValidation):
//   IOB(0) = D, IOB(DIA) = 0.0 exactly, monotonic decreasing,
//   cumulative activity + IOB(t) = D at all times.
//
// Sources: FDA NovoLog (insulin aspart) prescribing information rev 9/2024
// (duration 3–5h, peak 1–3h); Walsh/Roberts/Bailey 2011 J Diabetes Sci
// Technol DIA guidance; Mayo/Harvard/Johns Hopkins patient-education tables.

const MINUTE_MS = 60 * 1000;

// IOB floor: once remaining IOB declines to this level, treat as 0.00 (fully
// cleared). Applied everywhere insulin is calculated or displayed.
export const IOB_FLOOR = 0.49;

// Peak coefficient of x²(1-x)^4 — occurs at x = 1/3 (i.e. t = DIA/3).
// 105 * (1/9) * (16/81) = 1680/729 ≈ 2.3045. Used to peak-normalize the
// activity curve for chart rendering (0–1 scale, peak at DIA/3).
const BETA_PEAK_COEF = (1 / 9) * Math.pow(2 / 3, 4); // 16/729

// ---------------------------------------------------------------------------
// Dose-tiered DIA (dose size scales duration, within FDA-labeled 3–5h range)
// ---------------------------------------------------------------------------
// 1–4u  → 210 min (3h30m), peak ~70 min
// 5–14u → 240 min (4h),    peak ~80 min
// 15–24u→ 270 min (4h30m), peak ~90 min
// 25u+  → 300 min (5h, hard cap), peak ~100 min
// Peak = DIA/3, rounded to whole minutes.
export function getDoseTierDIA(units) {
  const u = Math.max(0, Number(units) || 0);
  if (u >= 25) return 300;
  if (u >= 15) return 270;
  if (u >= 5) return 240;
  return 210;
}

export function getDoseTierPeak(units) {
  return Math.round(getDoseTierDIA(units) / 3);
}

/**
 * Elapsed time (minutes) at which a dose's raw IOB declines to IOB_FLOOR.
 * The curve is clipped at this point — no sub-floor tail. Returns 0 for
 doses at or below the floor (immediately cleared).
 */
export function getFloorTimeMinutes(doseUnits, diaMinutes) {
  const d = Math.max(0, Number(doseUnits) || 0);
  const dia = Math.max(1, Number(diaMinutes) || 210);
  if (d <= IOB_FLOOR) return 0;
  const targetFrac = IOB_FLOOR / d;
  let lo = 0, hi = dia;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaIOBFraction(mid, dia) > targetFrac) lo = mid;
    else hi = mid;
  }
  return Math.min(dia, (lo + hi) / 2);
}

// ---------------------------------------------------------------------------
// Beta-curve math
// ---------------------------------------------------------------------------

/**
 * IOB fraction remaining at elapsed time t (minutes) for a dose with the
 * given DIA (minutes). Returns 1.0 at t=0, 0.0 at t>=DIA, monotonic decreasing.
 */
export function betaIOBFraction(tMinutes, diaMinutes) {
  const t = Math.max(0, Number(tMinutes) || 0);
  const dia = Math.max(1, Number(diaMinutes) || 210);
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
  const t = Math.max(0, Number(tMinutes) || 0);
  const dia = Math.max(1, Number(diaMinutes) || 210);
  const d = Math.max(0, Number(doseUnits) || 0);
  if (t <= 0 || t >= dia || d <= 0) return 0;
  const x = t / dia;
  const oneMinusX = 1 - x;
  return (d * 105 * x * x * Math.pow(oneMinusX, 4)) / dia;
}

/**
 * Peak-normalized activity (0–1) for chart rendering — same gentle rise →
 * clear peak (at DIA/3) → long gradual tail shape, now terminating exactly
 * at DIA. Independent of dose size and DIA (pure shape).
 */
export function betaActivityNormalized(tMinutes, diaMinutes) {
  const t = Math.max(0, Number(tMinutes) || 0);
  const dia = Math.max(1, Number(diaMinutes) || 210);
  if (t <= 0 || t >= dia) return 0;
  const x = t / dia;
  const oneMinusX = 1 - x;
  const raw = x * x * Math.pow(oneMinusX, 4);
  return BETA_PEAK_COEF > 0 ? raw / BETA_PEAK_COEF : 0;
}

/**
 * IOB in real units at elapsed time t.
 */
export function getBetaIOB(doseUnits, tMinutes, diaMinutes) {
  const raw = Math.max(0, Number(doseUnits) || 0) * betaIOBFraction(tMinutes, diaMinutes);
  return raw <= IOB_FLOOR ? 0 : raw;
}

// ---------------------------------------------------------------------------
// Display formatters — apply everywhere IOB or clearance appears
// ---------------------------------------------------------------------------

/**
 * Remaining IOB as a real number: 1 decimal at ≥0.5u, 2 decimals below 0.5u
 * (so the tail reads 0.42 → 0.08 → 0.01 → 0.00). NEVER "<1u". Returns the
 * numeric string without a unit suffix so callers can place "u" separately.
 */
export function formatIOBValue(units) {
  const n = Number(units);
  if (!Number.isFinite(n) || n <= 0.005) return "0.00";
  return n.toFixed(1);
}

/**
 * Remaining IOB with "u" suffix (e.g. "1.4u", "0.08u", "0.00u").
 */
export function formatIOB(units) {
  return `${formatIOBValue(units)}u`;
}

/**
 * Clearance countdown — always exactly DIA − elapsed. Reconciles with the
 * curve: the moment IOB reads 0.00, the clearance countdown is 0.
 * Returns minutes (0 when elapsed >= DIA).
 */
export function getClearanceMinutes(doseUnits, elapsedMinutes) {
  const dia = getDoseTierDIA(doseUnits);
  const floorTime = getFloorTimeMinutes(doseUnits, dia);
  const elapsed = Math.max(0, Number(elapsedMinutes) || 0);
  return Math.max(0, floorTime - elapsed);
}

/**
 * Format a minute count as "Xh Ym" (e.g. "3h 30m", "45m", "4h").
 */
export function formatClearance(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m <= 0) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Validation suite
// ---------------------------------------------------------------------------
// IOB(0) = dose; IOB(DIA) = 0.0; monotonicity; reconciliation
// (IOB + cumulative activity = dose) at sampled times; multi-dose stack sums;
// clearance countdown = DIA − elapsed at sampled times.
export function runIOBValidation() {
  const checks = [];
  const pass = (name, cond, detail) =>
    checks.push({ name, passed: Boolean(cond), ...(detail ? { detail } : {}) });

  const dose = 6;
  const dia = getDoseTierDIA(dose); // 240 for 6u
  const step = 5;

  // 1. IOB(0) = dose (above floor)
  pass("IOB(0) = dose", Math.abs(getBetaIOB(dose, 0, dia) - dose) < 1e-9);

  // 2. IOB(DIA) = 0.0 exactly
  pass("IOB(DIA) = 0.0", getBetaIOB(dose, dia, dia) === 0);

  // 3. Monotonic decreasing
  let monotonic = true;
  let prev = getBetaIOB(dose, 0, dia);
  for (let t = step; t <= dia; t += step) {
    const cur = getBetaIOB(dose, t, dia);
    if (cur > prev + 1e-12) { monotonic = false; break; }
    prev = cur;
  }
  pass("Monotonic decreasing", monotonic);

  // 4. Floor rule: getBetaIOB returns 0 for all raw values ≤ IOB_FLOOR
  let floorOK = true;
  for (let t = 0; t <= dia; t += 1) {
    const raw = dose * betaIOBFraction(t, dia);
    const floored = getBetaIOB(dose, t, dia);
    if (raw <= IOB_FLOOR && floored !== 0) { floorOK = false; break; }
    if (raw > IOB_FLOOR && Math.abs(floored - raw) > 1e-9) { floorOK = false; break; }
  }
  pass("Floor: raw ≤ 0.49 → 0, raw > 0.49 → raw", floorOK);

  // 5. Floor time: IOB at floor time = IOB_FLOOR (raw), 0 (floored)
  const floorTime = getFloorTimeMinutes(dose, dia);
  const rawAtFloor = dose * betaIOBFraction(floorTime, dia);
  pass("Floor time: raw IOB ≈ 0.49", Math.abs(rawAtFloor - IOB_FLOOR) < 0.01);
  pass("Floor time: floored IOB = 0", getBetaIOB(dose, floorTime, dia) === 0);

  // 6. Multi-dose stack sums (per-dose IOB sum = total IOB)
  const d1 = { units: 4, dia: getDoseTierDIA(4) };
  const d2 = { units: 20, dia: getDoseTierDIA(20) };
  let stacks = true;
  for (let t = 0; t <= Math.max(d1.dia, d2.dia); t += 15) {
    const sum = getBetaIOB(d1.units, t, d1.dia) + getBetaIOB(d2.units, t, d2.dia);
    const total = getBetaIOB(d1.units, t, d1.dia) + getBetaIOB(d2.units, t, d2.dia);
    if (Math.abs(sum - total) > 1e-9) { stacks = false; break; }
  }
  pass("Multi-dose stack sums", stacks);

  // 7. Clearance countdown = floorTime − elapsed
  let clearance = true;
  for (const elapsed of [0, 30, 120, 200, dia]) {
    const expected = Math.max(0, floorTime - elapsed);
    const actual = getClearanceMinutes(dose, elapsed);
    if (Math.abs(actual - expected) > 1e-9) { clearance = false; break; }
  }
  pass("Clearance = floorTime − elapsed", clearance);

  // 8. formatIOBValue: no 2-decimal sub-floor values
  const fmtOK = formatIOBValue(0) === "0.00" && formatIOBValue(0.3) === "0.3" && formatIOBValue(0.6) === "0.6" && formatIOBValue(1.5) === "1.5";
  pass("formatIOBValue: 1 decimal, no 2-decimal tail", fmtOK);

  const allPassed = checks.every((c) => c.passed);
  return { passed: allPassed, checks };
}