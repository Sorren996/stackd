// Dexcom-style glucose trend estimation built on the same 5-minute
// interpolation used for time-in-range.
//
// A raw two-point difference (e.g. 163 -> 156) misreads a slow drift as a
// "falling" arrow when the readings are far apart. Instead we take the most
// recent readings (up to 6, within a 3-hour span), fill the gaps with linear
// interpolation sampled every 5 minutes, and run a least-squares regression to
// get the glucose rate of change in mg/dL per minute. That rate is then mapped
// to Dexcom's trend-arrow thresholds:
//
//   Rising         >= +3 mg/dL/min
//   Slowly rising  >= +1
//   Stable         > -1 and < +1
//   Slowly falling > -3 (down to -1)
//   Falling        <= -3

const STEP_MS = 5 * 60 * 1000;
const MAX_SPAN_MS = 3 * 60 * 60 * 1000;
const MAX_POINTS = 3;

const RATE_FAST = 3;   // mg/dL per minute
const RATE_SLOW = 1;
const RATE_SLOW_NEG = -1;
const RATE_FAST_NEG = -3;

function interpolateValueAt(points, time) {
  if (time <= points[0].t) return points[0].v;
  const last = points[points.length - 1];
  if (time >= last.t) return last.v;
  for (let i = 1; i < points.length; i++) {
    if (time <= points[i].t) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.t - a.t || 1;
      return a.v + ((time - a.t) / span) * (b.v - a.v);
    }
  }
  return last.v;
}

export function computeGlucoseTrend(readings) {
  if (!Array.isArray(readings) || readings.length < 2) {
    return { icon: "right", label: "Stable" };
  }

  const points = readings
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), v: Number(r.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) return { icon: "right", label: "Stable" };

  // Acute change override: when the last two readings show a meaningful move,
  // surface it immediately so the card reflects what just happened rather than
  // being smoothed away by the regression over older points.
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (last && prev) {
    const gapMin = (last.t - prev.t) / 60000;
    const delta = last.v - prev.v;
    const absDelta = Math.abs(delta);
    if (gapMin > 0 && gapMin <= 45) {
      if (absDelta >= 25) return { icon: delta > 0 ? "up" : "down", label: delta > 0 ? "Rising" : "Falling" };
      if (absDelta >= 12) return { icon: delta > 0 ? "up-right" : "down-right", label: delta > 0 ? "Slowly rising" : "Slowly falling" };
    } else if (gapMin > 45 && gapMin <= 180) {
      if (absDelta >= 40) return { icon: delta > 0 ? "up" : "down", label: delta > 0 ? "Rising" : "Falling" };
      if (absDelta >= 20) return { icon: delta > 0 ? "up-right" : "down-right", label: delta > 0 ? "Slowly rising" : "Slowly falling" };
    }
  }

  const recent = points.slice(-MAX_POINTS);
  const newest = recent[recent.length - 1].t;
  let inSpan = recent.filter((p) => p.t >= newest - MAX_SPAN_MS);
  if (inSpan.length < 2) inSpan = recent.slice(-2);
  if (inSpan.length < 2) return { icon: "right", label: "Stable" };

  const start = inSpan[0].t;
  const end = inSpan[inSpan.length - 1].t;
  if (end <= start) return { icon: "right", label: "Stable" };

  const samples = [];
  for (let t = start; t <= end; t += STEP_MS) {
    samples.push({ t, v: interpolateValueAt(inSpan, t) });
  }
  if (samples.length < 2) {
    samples.length = 0;
    inSpan.forEach((p) => samples.push({ t: p.t, v: p.v }));
  }
  if (samples.length < 2) return { icon: "right", label: "Stable" };

  const n = samples.length;
  const meanX = samples.reduce((s, p) => s + p.t, 0) / n;
  const meanY = samples.reduce((s, p) => s + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of samples) {
    num += (p.t - meanX) * (p.v - meanY);
    den += (p.t - meanX) ** 2;
  }
  const slopePerMs = den !== 0 ? num / den : 0;
  const ratePerMin = slopePerMs * 60000;

  if (ratePerMin >= RATE_FAST) return { icon: "up", label: "Rising" };
  if (ratePerMin >= RATE_SLOW) return { icon: "up-right", label: "Slowly rising" };
  if (ratePerMin > RATE_SLOW_NEG) return { icon: "right", label: "Stable" };
  if (ratePerMin > RATE_FAST_NEG) return { icon: "down-right", label: "Slowly falling" };
  return { icon: "down", label: "Falling" };
}