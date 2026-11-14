// Backend mirror of src/lib/glucoseTrend.js resolution; presentation is shared by all server consumers.
import { measureVelocity, trendFromVelocity } from './measuredVelocity.ts';
import { trendPresentation } from './trendPresentation.ts';
export function computeGlucoseTrend(readings) {
  if (!Array.isArray(readings) || readings.length < 2) return null;
  const samples = readings.map((r) => ({
    recorded_at: r.recorded_at ?? (r.time != null ? new Date(r.time).toISOString() : r.t),
    value: Number(r.value != null ? r.value : r.v), source: r.source,
  })).filter((r) => r.recorded_at && Number.isFinite(r.value));
  if (samples.length < 2) return null;
  const newest = samples.map((r) => new Date(r.recorded_at).getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (!Number.isFinite(newest)) return null;
  // Sensor cadence only: measureVelocity ignores hand-logged points, and there
  // is no wider fallback, so a lone fingerstick never becomes a direction.
  const measured = measureVelocity(samples, newest);
  if (measured.velocity != null) return trendFromVelocity(measured.velocity);
  return null;
}
export function mapDexcomTrend(rawTrend) {
  const pair = trendPresentation(rawTrend);
  return pair ? { ...pair, label: pair.word } : null;
}
export function resolveGlucoseTrend(latestReading, readings, { now = Date.now(), stale = false, below = false, futureToleranceMinutes = 0 } = {}) {
  const source = latestReading?.source;
  const isSensor = source === 'dexcom' || source === 'dexcom_share';
  const at = Date.parse(latestReading?.recorded_at);
  const rawAge = (now - at) / 60000;
  const age = Math.max(0, rawAge);
  // Push callers opt into sensor clock skew; other server consumers stay unchanged.
  if (stale || source === 'system' || !Number.isFinite(at) || rawAge < -futureToleranceMinutes || (isSensor ? age >= 8 : age > 15)) return null;
  // An unusable sensor category is not permission to invent a replacement.
  const resolved = isSensor ? mapDexcomTrend(latestReading?.trend) : computeGlucoseTrend(readings);
  const pair = trendPresentation(resolved, { below });
  return pair ? { ...pair, label: pair.word, origin: isSensor ? 'sensor' : 'derived' } : null;
}