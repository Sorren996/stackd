// Follower-side insulin summary helpers.
//
// All pharmacology math comes from the SAME module the patient side uses
// (`../insulinPharmacology`) — the follower screen never re-implements a
// curve. The availability gate lives in ./insulinEstimateGate.

import {
  getTotalBolusIOB,
  isBolusInsulinType,
  getInsulinCategory,
  getInsulinProfile,
} from "../insulinPharmacology.js";
import { describeActiveInsulinEstimate } from "./insulinEstimateGate.js";

/**
 * Split a window of doses into rapid-acting and everything-else so the
 * simplified follower screen can present them clearly apart.
 * No dose recommendations, no calculators, no meal association.
 */
export function splitSharedDoses(doses) {
  const rapid = [];
  const other = [];
  for (const dose of Array.isArray(doses) ? doses : []) {
    if (isBolusInsulinType(dose?.insulin_type)) rapid.push(dose);
    else other.push(dose);
  }
  return { rapid, other };
}

export function describeDoseCategory(insulinType) {
  return getInsulinCategory(insulinType) || "Insulin";
}

/**
 * Estimated active RAPID-ACTING insulin for the follower view.
 * Returns the shared gate's shape: { available, reason, value, isZero }.
 */
export function computeSharedActiveInsulin(doses, now = Date.now(), { doseMathAvailable = false } = {}) {
  const rapid = Array.isArray(doses) ? doses.filter((d) => isBolusInsulinType(d?.insulin_type)) : [];

  // A dose whose product we cannot identify has no computable curve, so the
  // estimate is unavailable rather than guessed.
  const hasUnknownType = rapid.some((d) => !getInsulinProfile(d?.insulin_type));
  if (doseMathAvailable && rapid.length > 0 && hasUnknownType) {
    return { available: false, reason: "unknown_type", value: null, isZero: false };
  }

  const value = rapid.length > 0 ? getTotalBolusIOB(rapid, now) : null;
  return describeActiveInsulinEstimate(value, doseMathAvailable, rapid.length);
}