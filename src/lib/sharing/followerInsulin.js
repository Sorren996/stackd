// Follower-side insulin view model.
//
// Every bit of pharmacology comes from the SAME module the patient side uses
// (`../insulinPharmacology`), and every basal word comes from the SAME basal
// model (`../basalActivityModel`). Nothing is re-implemented here: this module
// only decides WHICH logged doses are still acting and how to describe them, so
// the follower's figure cannot drift from the patient's own.
//
// It never produces a dose recommendation, and it never turns "this cannot be
// worked out" into a zero.

import {
  formatMinutes,
  getDoseStatus,
  getDoseTimingInfo,
  getInsulinCategory,
  getInsulinProfile,
  getTotalBolusIOB,
  isBasalInsulinType,
  isBolusInsulinType,
} from "../insulinPharmacology.js";
import { getBasalRegimenStatus } from "../basalActivityModel.js";
import { describeActiveInsulinEstimate } from "./insulinEstimateGate.js";

/**
 * A dose is only usable if it has a real amount and a real past time. A dose
 * with no recorded amount is not a dose of zero — it is unknown, and it is
 * left out rather than modelled as nothing.
 */
function isModellableDose(dose, now) {
  const units = Number(dose?.units);
  if (!Number.isFinite(units) || units <= 0) return false;
  const timeMs = new Date(String(dose?.administered_at)).getTime();
  if (!Number.isFinite(timeMs) || timeMs > now) return false;
  return true;
}

/**
 * Every logged dose that is STILL acting, most recent first, described with the
 * patient engine's own stage, progress and time remaining.
 *
 * Excluded: doses whose own curve has already cleared, doses dated in the
 * future, doses without a usable amount, and products we cannot identify (no
 * validated curve exists for them).
 */
export function activeInsulinDoses(doses, now = Date.now()) {
  const list = Array.isArray(doses) ? doses : [];
  const active = [];

  for (const dose of list) {
    if (!isModellableDose(dose, now)) continue;
    const profile = getInsulinProfile(dose.insulin_type);
    if (!profile) continue;

    const status = getDoseStatus(dose, now);
    if (status.phase === "expired") continue;

    const timing = getDoseTimingInfo(dose, now);
    // A premixed product has no single validated countdown: its stage is still
    // described, but no approximate time is claimed for it.
    const countdown =
      profile.model !== "premix" && !timing.isExpired && timing.remainingMin > 0
        ? timing.remainingMin
        : null;

    active.push({
      insulin_type: dose.insulin_type,
      units: Number(dose.units),
      administered_at: dose.administered_at,
      time_ms: new Date(String(dose.administered_at)).getTime(),
      category: getInsulinCategory(dose.insulin_type),
      is_rapid: isBolusInsulinType(dose.insulin_type),
      is_basal: isBasalInsulinType(dose.insulin_type),
      stage: status.label,
      progress: Number.isFinite(timing.progress) ? Math.min(1, Math.max(0, timing.progress)) : 0,
      remaining_minutes: countdown,
      remaining_label: countdown != null ? formatMinutes(countdown) : null,
    });
  }

  return active.sort((a, b) => b.time_ms - a.time_ms);
}

/**
 * Estimated active RAPID-ACTING insulin for the follower view, from the patient
 * engine's own IOB function against the sharer's confirmed plan.
 *
 * Returns the shared gate's shape: { available, reason, value, isZero }.
 * "available: false" (plan unconfirmed, product unrecognised, nothing
 * computable) is displayed as an honest non-numeric state, never as 0.0 u.
 */
export function computeSharedActiveInsulin(doses, now = Date.now(), { doseMathAvailable = false } = {}) {
  const list = Array.isArray(doses) ? doses : [];
  if (!doseMathAvailable) return describeActiveInsulinEstimate(null, false);

  // A product we cannot identify has no curve, so a total that included it
  // would be an undercount presented as a measurement.
  const unknown = list.some((dose) => isModellableDose(dose, now) && !getInsulinProfile(dose?.insulin_type));
  if (unknown) return { available: false, reason: "unknown_type", value: null, isZero: false };

  const modellable = list.filter((dose) => isModellableDose(dose, now));
  return describeActiveInsulinEstimate(getTotalBolusIOB(modellable, now), true);
}

/**
 * The sharer's basal coverage, in the patient app's own plain words.
 *
 * Reported as a state label only. It is never converted into units remaining:
 * this model describes background coverage, and it does not measure how much
 * insulin is physically left in the body. Returns null when no basal is logged
 * in the period we can see, so nothing is claimed at all.
 */
export function sharedBasalSummary(doses, now = Date.now()) {
  const status = getBasalRegimenStatus(Array.isArray(doses) ? doses : [], now);
  if (!status || status.state === "none" || !status.coverageLabel) return null;
  return {
    state: status.state,
    label: status.coverageLabel,
    insulin_type: status.insulinType || null,
  };
}