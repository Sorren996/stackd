// Stackd Insight Engine — Measured glucose velocity (server copy)
//
// Mirrors src/lib/insightEngine/measuredVelocity.js. The projection's opening
// rate and the trend arrow must come from one measurement, and the frontend
// arrow cannot import a backend module, so this file carries the same function
// and the same thresholds for the backend engine.
//
// Theil–Sen slope (median of all pairwise slopes) over the last 15 minutes of
// real readings, three samples minimum, and nothing at all — never a zero —
// when the series is too short, too old, duplicated, or interpolated.

import { trendLevelFromRate } from './trendPresentation.ts';

export const VELOCITY_WINDOW_MIN = 15;
export const VELOCITY_MIN_SAMPLES = 3;
export const VELOCITY_STALE_MIN = 15;
export const VELOCITY_MAX_MGDL_PER_MIN = 3;

export const TREND_FAST_RATE = 3;
export const TREND_SLOW_RATE = 1;

const MINUTE_MS = 60 * 1000;

export interface VelocitySample {
  t: number;
  v: number;
  source: string;
  interpolated: boolean;
}

export interface MeasuredVelocity {
  velocity: number | null;
  sampleCount: number;
  spanMin: number | null;
  method: string;
  reason: string | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function normalizeReadingSamples(readings: any[]): VelocitySample[] {
  if (!Array.isArray(readings)) return [];
  return readings
    .map((r) => {
      if (!r) return null;
      const rawTime = r.time != null ? r.time : r.recorded_at != null ? r.recorded_at : r.t;
      const t = rawTime instanceof Date
        ? rawTime.getTime()
        : typeof rawTime === "number" ? rawTime : new Date(rawTime).getTime();
      const v = Number(r.value != null ? r.value : r.v);
      if (!Number.isFinite(t) || !Number.isFinite(v)) return null;
      const source = String(r.source || "");
      const interpolated = r.interpolated === true || source === "system";
      return { t, v, source, interpolated };
    })
    .filter(Boolean) as VelocitySample[];
}

export function measureVelocity(
  rawReadings: any[],
  atTime?: number,
  options: { windowMin?: number; minSamples?: number } = {}
): MeasuredVelocity {
  const windowMin = Number(options.windowMin) > 0 ? Number(options.windowMin) : VELOCITY_WINDOW_MIN;
  const minSamples = Number(options.minSamples) > 0
    ? Math.max(2, Number(options.minSamples))
    : VELOCITY_MIN_SAMPLES;

  // A hand-logged point is an instant, not a sensor grid point: it may stand as
  // a level, but it never takes part in a rate. With manual samples dropped, a
  // series of fingersticks alone has nothing to measure and no arrow is drawn.
  const points = normalizeReadingSamples(rawReadings).filter((p) => p.source !== "manual");
  const newest = points.length ? points[points.length - 1] : null;
  const anchorMs = Number.isFinite(Number(atTime)) ? Number(atTime) : newest?.t;

  const unusable = (reason: string, sampleCount = 0): MeasuredVelocity => ({
    velocity: null,
    sampleCount,
    spanMin: null,
    method: "theil_sen",
    reason,
  });

  if (!points.length || !Number.isFinite(anchorMs as number)) return unusable("too_few_readings");

  if (((anchorMs as number) - newest!.t) / MINUTE_MS > VELOCITY_STALE_MIN) {
    return unusable("stale", points.length);
  }

  const window = points.filter(
    (p) => p.t <= (anchorMs as number) && p.t >= (anchorMs as number) - windowMin * MINUTE_MS
  );
  if (window.length < minSamples) return unusable("too_few_readings", window.length);

  const seen = new Set<number>();
  for (const p of window) {
    if (seen.has(p.t)) return unusable("duplicate_readings", window.length);
    seen.add(p.t);
  }
  if (window.some((p) => p.interpolated)) return unusable("interpolated_readings", window.length);

  const slopes: number[] = [];
  for (let i = 0; i < window.length; i++) {
    for (let j = i + 1; j < window.length; j++) {
      const dtMin = (window[j].t - window[i].t) / MINUTE_MS;
      if (!(dtMin > 0)) continue;
      slopes.push((window[j].v - window[i].v) / dtMin);
    }
  }
  const velocity = median(slopes);
  if (velocity == null) return unusable("too_few_readings", window.length);

  return {
    velocity: Math.round(velocity * 100) / 100,
    sampleCount: window.length,
    spanMin: Math.round(((window[window.length - 1].t - window[0].t) / MINUTE_MS) * 10) / 10,
    method: "theil_sen",
    reason: null,
  };
}

export function trendFromVelocity(velocity: number | null) {
  const pair = trendLevelFromRate(velocity);
  return pair ? { ...pair, label: pair.word } : null;
}