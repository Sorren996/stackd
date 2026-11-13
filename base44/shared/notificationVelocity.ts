import { normalizeTrendWord } from './notificationTrend.ts';
import { notificationAgeMinutes } from './notificationTiming.ts';

// Stackd-only fallback, NOT the Dexcom arrow/alert algorithm. Ingested rows
// contain categorical trend strings only; they cannot define numeric velocity.
// Four real same-source CGM readings, 12–18 minutes overall, 3–7 min intervals.
// Noise guard: same direction in every interval, each at least half the chosen
// rate, and no interval > twice the fitted rate (reject isolated step spikes).
export function notificationVelocity(samples, nowMs) {
  const window = samples.slice(-4);
  if (window.length !== 4) return null;
  const last = window[3];
  const age = notificationAgeMinutes(last.at, nowMs);
  if (age == null || age > 10) return null;
  if (!['dexcom', 'dexcom_share'].includes(last.source)) return null;
  if (window.some(s => s.source !== last.source)) return null;
  const span = (last.at - window[0].at) / 60000;
  if (span < 12 || span > 18) return null;
  const intervals = window.slice(1).map((s, i) => (s.at - window[i].at) / 60000);
  if (intervals.some(dt => dt < 3 || dt > 7)) return null;
  const xs = window.map(s => (s.at - window[0].at) / 60000);
  const mx = xs.reduce((a, b) => a + b, 0) / 4;
  const my = window.reduce((a, s) => a + s.value, 0) / 4;
  const slope = window.reduce((sum, s, i) => sum + (xs[i] - mx) * (s.value - my), 0) /
    xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  const rates = window.slice(1).map((s, i) => (s.value - window[i].value) / intervals[i]);
  return { slope, rates };
}
export function velocityMeets(velocity, direction, rate) {
  if (!velocity || ![2, 3].includes(rate)) return false;
  const sign = direction === 'rising_fast' ? 1 : -1;
  const fit = sign * velocity.slope;
  return fit + 1e-9 >= rate && velocity.rates.every(r => sign * r + 1e-9 >= rate / 2 && Math.abs(r) <= 2 * fit + 1e-9);
}
export function episodeSamples(rows, nowMs) {
  const byTime = new Map();
  const ids = new Map();
  let conflict = false;
  for (const row of rows || []) {
    const at = Date.parse(row.recorded_at);
    const value = row.value;
    const source = String(row.source || 'manual').toLowerCase();
    if (!['manual', 'dexcom', 'dexcom_share'].includes(source) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isFinite(at) || notificationAgeMinutes(at, nowMs) == null) continue;
    if (ids.has(row.id) && row.id) { const prior = ids.get(row.id); if (prior.at !== at || prior.value !== value || prior.source !== source) conflict = true; continue; }
    if (row.id) ids.set(row.id, { at, value, source });
    if (byTime.has(at)) { if (byTime.get(at).value !== value || byTime.get(at).source !== source) conflict = true; continue; }
    // The trend belongs to this measurement only; a manual row has none.
    const trend = source === 'dexcom' || source === 'dexcom_share' ? normalizeTrendWord(row.trend) : null;
    byTime.set(at, { id: row.id || String(at), at, value, source, trend });
  }
  return { samples: [...byTime.values()].sort((a, b) => a.at - b.at), conflict };
}