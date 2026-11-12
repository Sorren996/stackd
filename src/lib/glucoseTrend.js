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
//   Rising          >= +3 mg/dL/min
//   Slowly rising   >= +1
//   Stable          > -1 and < +1
//   Slowly falling  > -3 (down to -1)
//   Falling         <= -3
//
// When the last 15 minutes hold fewer than three readings (a hand-logged day,
// rather than a CGM), the same function is asked over a wider three-hour window
// so the arrow still exists. Where both surfaces have a measurement, they have
// the same one.

// Relative, not the @/ alias: this module is imported directly by the
// node-runnable trend-mark test, where the alias does not resolve.
import { measureVelocity, trendFromVelocity } from "./insightEngine/measuredVelocity.js";

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
// map to the same five icon keys used by computeGlucoseTrend.
export function mapDexcomTrend(rawTrend) {
  if (!rawTrend || typeof rawTrend !== "string") return null;

  const t = rawTrend
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .trim();

  if (t === "double_up" || t === "up_up") return { icon: "double_up", label: "Rising quickly" };
  if (t === "single_up" || t === "up") return { icon: "up", label: "Rising" };
  if (t === "forty_five_up" || t === "down_up") return { icon: "up-right", label: "Slowly rising" };
  if (t === "flat") return { icon: "right", label: "Stable" };
  if (t === "forty_five_down" || t === "up_down") return { icon: "down-right", label: "Slowly falling" };
  if (t === "single_down" || t === "down") return { icon: "down", label: "Falling" };
  if (t === "double_down" || t === "down_down") return { icon: "double_down", label: "Falling quickly" };

  return null;
}

/**
 * The one trend result a glucose surface may display.
 *
 * A sensor's OWN reported arrow is authoritative when the source supplies one,
 * so a genuine Dexcom DoubleDown renders as a double-down arrow labelled
 * "Falling quickly" instead of being re-derived from the numbers. Only when no
 * supplied arrow exists is a rate derived from the real readings, and when
 * there is not enough evidence for either the answer is null — never the steady
 * arrow, which would assert something nobody measured.
 *
 * Both Dexcom sources count: the official API ("dexcom") and the Share service
 * ("dexcom_share"), which is what a Share-connected account writes.
 */
export function resolveGlucoseTrend(latestReading, readings) {
  const source = latestReading?.source;
  const isSensor = source === "dexcom" || source === "dexcom_share";
  const supplied = isSensor ? mapDexcomTrend(latestReading?.trend) : null;
  if (supplied) return { ...supplied, origin: "sensor" };

  const derived = computeGlucoseTrend(readings);
  return derived ? { ...derived, origin: "derived" } : null;
}

/**
 * The plain-language movement of the last few readings, for a tooltip's range
 * line. Always measured across the last three or four readings (never one), so
 * a single wiggle is not described as a climb or a fall.
 *
 * Returns null when there is not enough evidence to describe movement — the
 * caller then shows no movement line at all rather than "holding steady", which
 * would claim something nobody measured.
 */
const TREND_WORD_BY_ICON = {
  double_up: "climbing",
  up: "climbing",
  "up-right": "still rising",
  right: "holding steady",
  "down-right": "easing down",
  down: "falling",
  double_down: "falling",
};

export function glucoseTrendWord(readings) {
  if (!Array.isArray(readings) || readings.length < 2) return null;
  const recent = readings.slice(-4);
  const trend = computeGlucoseTrend(recent);
  if (!trend) return null;
  return TREND_WORD_BY_ICON[trend.icon] || null;
}