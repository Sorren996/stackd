// Stackd — rescue-carb learning.
//
// A rescue carb is a small, fast carbohydrate taken to lift glucose. It is the
// one part of the forecast that was still drawn from a generic number: how much
// a person's glucose actually rises per gram, and how quickly. This module
// measures the rise that actually followed the person's own logged rescues and
// expresses the difference as two bounded multipliers the engine then applies to
// FUTURE rescues:
//
//   magnitudeFactor — observed rise relative to the generic fast profile
//   speedFactor     — observed time to peak relative to the generic fast profile
//
// Deliberately conservative:
//   • a rescue with an overlapping meal or a nearby insulin dose is not evidence
//     of anything, so it is excluded rather than averaged in;
//   • an episode needs a clean starting value and a peak that is actually visible
//     inside the observation window;
//   • nothing changes until MIN_EPISODES clean episodes exist, so a single
//     unusual afternoon can never rewrite the model;
//   • each accepted change is damped and both factors are clamped well inside
//     the profile's usable range.
//
// Wellness estimate only. This module never informs, calculates or suggests a
// dose, and it never touches insulin coverage or meal-review statistics.

import { carbAbsorptionFraction, carbShapeFor } from "./glucoseSuperposition.ts";

const MINUTE_MS = 60 * 1000;

/** Below this, the generic fast profile stands and nothing is claimed. */
export const MIN_EPISODES = 3;
/** A rescue needs this long after it to have shown its whole rise. */
const OBSERVE_WINDOW_MIN = 60;
/** The episode must be at least this old before it is judged. */
const MIN_AGE_MIN = 45;
/** A start value must sit this close to the rescue to be its baseline. */
const START_LOOKBACK_MIN = 15;
/** Another meal this close means the rise is not the rescue's alone. */
const MEAL_CONFOUNDER_MIN = 45;
/**
 * Insulin BEFORE the rescue this close could be doing the work instead.
 * Insulin AFTER it only disqualifies the episode when it lands before the peak,
 * because a dose given after glucose has already peaked cannot have caused the
 * rise being measured — treating it as a confounder would throw away most real
 * rescue episodes (a person often corrects once they see the climb).
 */
const DOSE_BEFORE_MIN = 20;
/** A believable peak for a fast carbohydrate. */
const PEAK_WINDOW_MIN = { min: 10, max: OBSERVE_WINDOW_MIN };
/** Only episodes this far back are used, so old habits do not dominate. */
export const LEARNING_LOOKBACK_DAYS = 60;

export const MAGNITUDE_BOUNDS = { min: 0.7, max: 1.3 };
export const SPEED_BOUNDS = { min: 0.75, max: 1.35 };
/** Each accepted update moves at most this share of the way to the observation. */
const DAMPING = 0.4;
/** A change smaller than this is noise, not learning. */
const MIN_MEANINGFUL_CHANGE = 0.02;

export interface RescueModelParameters {
  magnitude_factor: number;
  speed_factor: number;
}

export interface RescueLearningResult {
  magnitudeFactor: number;
  speedFactor: number;
  sampleCount: number;
  /** Median observed / expected ratios, for auditability only. */
  observedRatio: { magnitude: number; speed: number } | null;
  changed: boolean;
}

const clamp = (value: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, value));

function isRescue(entry: any): boolean {
  return entry?.is_rescue_carb === true || entry?.classification === "rescue_carbs";
}

function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Episode {
  carbs: number;
  riseMgdl: number;
  minutesToPeak: number;
}

/**
 * Find rescue episodes that are clean enough to learn from: a baseline reading
 * just before the rescue, a visible peak inside the window, and no other carb or
 * insulin close enough to explain the rise.
 */
export function observeRescueEpisodes({
  meals,
  doses,
  readings,
  nowMs,
}: {
  meals: any[];
  doses: any[];
  readings: any[];
  nowMs: number;
}): Episode[] {
  const since = nowMs - LEARNING_LOOKBACK_DAYS * 24 * 60 * MINUTE_MS;
  const series = (Array.isArray(readings) ? readings : [])
    .map((r) => ({ t: Date.parse(r.recorded_at), v: Number(r.value) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.v))
    .sort((a, b) => a.t - b.t);
  if (series.length < 2) return [];

  const mealTimes = (Array.isArray(meals) ? meals : [])
    .map((m) => ({ t: Date.parse(m.consumed_at), rescue: isRescue(m) }))
    .filter((m) => Number.isFinite(m.t));
  const doseTimes = (Array.isArray(doses) ? doses : [])
    .map((d) => Date.parse(d.administered_at || d.created_at))
    .filter((t) => Number.isFinite(t));

  const episodes: Episode[] = [];

  for (const meal of Array.isArray(meals) ? meals : []) {
    if (!isRescue(meal)) continue;
    const carbs = Number(meal.carbs);
    const at = Date.parse(meal.consumed_at);
    if (!Number.isFinite(at) || !(carbs > 0)) continue;
    if (at > nowMs - MIN_AGE_MIN * MINUTE_MS) continue;
    if (at < since) continue;

    // Another carb close by: the rise belongs to the meal, not the rescue.
    const otherCarbNearby = mealTimes.some(
      (other) => other.t !== at && Math.abs(other.t - at) <= MEAL_CONFOUNDER_MIN * MINUTE_MS && other.t >= at - MEAL_CONFOUNDER_MIN * MINUTE_MS
    );
    if (otherCarbNearby) continue;

    // Insulin just before the rescue: it could be responsible for the change.
    const doseBefore = doseTimes.some(
      (t) => t >= at - DOSE_BEFORE_MIN * MINUTE_MS && t < at
    );
    if (doseBefore) continue;

    // Baseline: the last reading in the lookback window before the rescue.
    const baseline = [...series]
      .reverse()
      .find((r) => r.t <= at && r.t >= at - START_LOOKBACK_MIN * MINUTE_MS);
    if (!baseline) continue;

    const window = series.filter(
      (r) => r.t >= at && r.t <= at + OBSERVE_WINDOW_MIN * MINUTE_MS
    );
    if (window.length < 2) continue;

    let peak = window[0];
    for (const r of window) if (r.v > peak.v) peak = r;
    const rise = peak.v - baseline.v;
    if (!(rise > 0)) continue;

    const minutesToPeak = (peak.t - at) / MINUTE_MS;
    if (minutesToPeak < PEAK_WINDOW_MIN.min || minutesToPeak > PEAK_WINDOW_MIN.max) continue;

    // A dose landing between the rescue and its peak could be driving the
    // change, so this episode is not evidence of what the carbs did.
    const doseDuringRise = doseTimes.some((t) => t >= at && t <= peak.t);
    if (doseDuringRise) continue;

    episodes.push({ carbs, riseMgdl: rise, minutesToPeak });
  }

  return episodes;
}

/**
 * Derive the two multipliers from the person's clean episodes.
 *
 * The generic profile is evaluated at the SAME elapsed minute the observed peak
 * occurred, so a person whose rise simply peaks later is not mistaken for one
 * whose rise is smaller.
 */
export function learnRescueCarbModel({
  episodes,
  previous,
  mgPerGram,
}: {
  episodes: Episode[];
  previous?: RescueModelParameters | null;
  mgPerGram: number;
}): RescueLearningResult {
  const startMagnitude = clamp(
    Number(previous?.magnitude_factor) || 1,
    MAGNITUDE_BOUNDS.min,
    MAGNITUDE_BOUNDS.max
  );
  const startSpeed = clamp(
    Number(previous?.speed_factor) || 1,
    SPEED_BOUNDS.min,
    SPEED_BOUNDS.max
  );

  if (!(mgPerGram > 0) || episodes.length < MIN_EPISODES) {
    return {
      magnitudeFactor: startMagnitude,
      speedFactor: startSpeed,
      sampleCount: episodes.length,
      observedRatio: null,
      changed: false,
    };
  }

  const magnitudeRatios: number[] = [];
  const speedRatios: number[] = [];

  for (const episode of episodes) {
    const shape = carbShapeFor("fast", startSpeed);
    const expectedRise = episode.carbs * mgPerGram * carbAbsorptionFraction(episode.minutesToPeak, shape);
    if (expectedRise > 0) magnitudeRatios.push(episode.riseMgdl / expectedRise);
    const expectedPeakMin = shape.firstPeakMin;
    if (expectedPeakMin > 0) speedRatios.push(episode.minutesToPeak / expectedPeakMin);
  }

  const magnitudeRatio = median(magnitudeRatios);
  const speedRatio = median(speedRatios);

  const nextMagnitude = Number.isFinite(magnitudeRatio)
    ? clamp(startMagnitude * (1 + DAMPING * (magnitudeRatio - 1)), MAGNITUDE_BOUNDS.min, MAGNITUDE_BOUNDS.max)
    : startMagnitude;
  const nextSpeed = Number.isFinite(speedRatio)
    ? clamp(startSpeed * (1 + DAMPING * (speedRatio - 1)), SPEED_BOUNDS.min, SPEED_BOUNDS.max)
    : startSpeed;

  const round = (n: number) => Math.round(n * 1000) / 1000;
  const magnitudeFactor = round(nextMagnitude);
  const speedFactor = round(nextSpeed);
  const changed =
    Math.abs(magnitudeFactor - startMagnitude) >= MIN_MEANINGFUL_CHANGE ||
    Math.abs(speedFactor - startSpeed) >= MIN_MEANINGFUL_CHANGE;

  return {
    magnitudeFactor: changed ? magnitudeFactor : startMagnitude,
    speedFactor: changed ? speedFactor : startSpeed,
    sampleCount: episodes.length,
    observedRatio: {
      magnitude: Number.isFinite(magnitudeRatio) ? round(magnitudeRatio) : 1,
      speed: Number.isFinite(speedRatio) ? round(speedRatio) : 1,
    },
    changed,
  };
}