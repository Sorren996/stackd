// Dexcom-style glucose trend estimation, built on the engine's ONE measured
// velocity.
//
// The arrow beside the reading and the projection's opening rate used to be two
// different measurements: this file ran a two-point absolute-change override
// ("25 mg/dL between readings → double_down"), the engine read the last two
// points of a 30-minute window. A morning falling at -1.4 mg/dL/min could
// therefore wear a falling arrow over a rising forecast, which costs more trust
// than a wide band ever does.
//
// Both now call measureVelocity() — a Theil–Sen slope (median of all pairwise
// slopes) over the last 15 minutes, three samples minimum — and both map the
// result through the same thresholds:
//
//   Magnitude <1: flat; 1–<2: angled; 2–<3: straight; >=3: double.
//   Both signs use the same tiers. Presentation lives in trendPresentation.
//
// When the last 15 minutes hold fewer than three readings (a hand-logged day,
// rather than a CGM), the same function is asked over a wider three-hour window
// so the arrow still exists. Where both surfaces have a measurement, they have
// the same one.

// Relative, not the @/ alias: this module is imported directly by the
// node-runnable trend-mark test, where the alias does not resolve.
import { measureVelocity, trendFromVelocity } from "./insightEngine/measuredVelocity.js";
import { trendPresentation } from './trendPresentation.js';

const WIDE_WINDOW_MIN = 180;

/**
 * Every arrow this mapping can produce, and the complete set a glucose card may
 * draw. Both the derived-rate mapping and the CGM's own reported trend resolve
 * to these names, so one arrow component can draw them all — and a test asserts
 * that no direction can ever come back without an arrow to show it.
 */
export const TREND_ICON_KEYS = [
  "double_up",
  "up",
  "up-right",
  "right",
  "down-right",
  "down",
  "double_down",
];

// Returns null when a rate cannot be measured from the readings available.
// "We cannot tell" is never flattened into the steady arrow — a stable glyph
// has to be earned by a measured near-zero rate.
export function computeGlucoseTrend(readings) {
  if (!Array.isArray(readings) || readings.length < 2) return null;

  const samples = readings
    .map((r) => ({
      recorded_at: r.recorded_at ?? (r.time != null ? new Date(r.time).toISOString() : r.t),
      value: Number(r.value != null ? r.value : r.v),
      source: r.source,
    }))
    .filter((r) => r.recorded_at && Number.isFinite(r.value));

  if (samples.length < 2) return null;

  const newest = samples
    .map((r) => new Date(r.recorded_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (!Number.isFinite(newest)) return null;

  const measured = measureVelocity(samples, newest);
  if (measured.velocity != null) return trendFromVelocity(measured.velocity);

  // Only a thin window falls back — a stale, duplicated or interpolated series
  // is reported as no arrow rather than measured over a longer stretch.
  if (measured.reason === "too_few_readings") {
    const wide = measureVelocity(samples, newest, { windowMin: WIDE_WINDOW_MIN, minSamples: 2 });
    if (wide.velocity != null) return trendFromVelocity(wide.velocity);
  }

  return null;
}

// Maps a native Dexcom trend string to our icon/label format.
// Dexcom returns camelCase strings like "doubleUp", "flat", "singleDown".
// We normalize to handle snake_case and underscore variants too, then
// map to the same seven icon keys used by computeGlucoseTrend.
export function mapDexcomTrend(rawTrend) {
  const pair = trendPresentation(rawTrend);
  return pair ? { ...pair, label: pair.word } : null;
}

/**
 * The one trend result a glucose surface may display.
 *
 * A sensor's OWN reported arrow is authoritative when the source supplies one,
 * so a genuine Dexcom DoubleDown renders as a double-down arrow labelled
 * "falling fast" instead of being re-derived from the numbers. Only non-sensor
 * readings use a rate derived from the real readings, and when
 * there is not enough evidence for either the answer is null — never the steady
 * arrow, which would assert something nobody measured.
 *
 * Both Dexcom sources count: the official API ("dexcom") and the Share service
 * ("dexcom_share"), which is what a Share-connected account writes.
 */
export function resolveGlucoseTrend(latestReading, readings, { now = Date.now(), stale = false, below = false } = {}) {
  const source = latestReading?.source;
  const isSensor = source === 'dexcom' || source === 'dexcom_share';
  const at = Date.parse(latestReading?.recorded_at);
  const age = (now - at) / 60000;
  if (stale || source === 'system' || !Number.isFinite(at) || age < 0 || (isSensor ? age >= 8 : age > 15)) return null;
  // An unusable sensor category is not permission to invent a replacement.
  const resolved = isSensor ? mapDexcomTrend(latestReading?.trend) : computeGlucoseTrend(readings);
  const pair = trendPresentation(resolved, { below });
  return pair ? { ...pair, label: pair.word, origin: isSensor ? 'sensor' : 'derived' } : null;
}

/**
 * Compatibility word accessor. Resolves the newest reading's arrow first;
 * it never calculates movement using a separate window or value difference.
 *
 * Returns null when there is not enough evidence to describe movement — the
 * caller then shows no movement line at all rather than "holding steady", which
 * would claim something nobody measured.
 */
export function glucoseTrendWord(readings, options = {}) {
  const latest = [...(readings || [])].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0];
  return resolveGlucoseTrend(latest, readings, options)?.word || null;
}