import { useMemo } from "react";
import { generateCarbCurve } from "@/lib/carbAbsorption";

const W = 260;
const H = 56;
const COPPER = "#9c5228";
const HAIRLINE = "#eadccf";

/**
 * A single absorption curve in copper, with a "now" dot. Built by summing the
 * existing carb absorption curves for every item in the meal — same model the
 * app uses elsewhere, no invented shape.
 */
export default function AbsorptionCurve({ entries, mealTime, now = Date.now() }) {
  const { path, nowX, nowY } = useMemo(() => {
    const curves = (Array.isArray(entries) ? entries : [])
      .map((entry) => {
        if (!entry || !Number.isFinite(entry.carbs)) return null;
        const forCalc = (!entry.absorption_profile || entry.is_custom)
          ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false }
          : entry;
        return generateCarbCurve(forCalc);
      })
      .filter(Boolean);

    if (!curves.length) return { path: "", nowX: 0, nowY: 0 };

    const start = mealTime;
    let end = start;
    curves.forEach((c) => { if (c.length) end = Math.max(end, c[c.length - 1].time); });
    if (end <= start) end = start + 4 * 3600 * 1000;
    const span = end - start;

    const STEP = 5 * 60 * 1000;
    const samples = [];
    for (let t = start; t <= end; t += STEP) {
      let rate = 0;
      curves.forEach((curve) => {
        for (let i = 0; i < curve.length - 1; i++) {
          if (curve[i].time <= t && curve[i + 1].time >= t) {
            const r = (t - curve[i].time) / (curve[i + 1].time - curve[i].time || 1);
            rate += curve[i].activity + (curve[i + 1].activity - curve[i].activity) * r;
            break;
          }
        }
      });
      samples.push({ t, rate });
    }

    const maxRate = Math.max(...samples.map((s) => s.rate), 0.0001);
    const toX = (t) => ((t - start) / span) * (W - 4) + 2;
    const toY = (r) => H - 4 - (r / maxRate) * (H - 8);

    const d = samples
      .map((s, i) => `${i ? "L" : "M"} ${toX(s.t).toFixed(1)} ${toY(s.rate).toFixed(1)}`)
      .join(" ");

    const nowClamped = Math.min(now, end);
    let nowRate = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].t <= nowClamped && samples[i + 1].t >= nowClamped) {
        const r = (nowClamped - samples[i].t) / (samples[i + 1].t - samples[i].t || 1);
        nowRate = samples[i].rate + (samples[i + 1].rate - samples[i].rate) * r;
        break;
      }
    }
    return { path: d, nowX: toX(nowClamped), nowY: toY(nowRate) };
  }, [entries, mealTime, now]);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1={2} y1={H - 4} x2={W - 2} y2={H - 4} stroke={HAIRLINE} strokeWidth={0.75} />
      {path && <path d={path} fill="none" stroke={COPPER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {nowX > 0 && <circle cx={nowX} cy={nowY} r={3} fill={COPPER} />}
    </svg>
  );
}

// Peak-min-ago helper for the absorption caption.
export function getPeakMinAgo(entries, mealTime, now = Date.now()) {
  const curves = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (!entry || !Number.isFinite(entry.carbs)) return null;
      const forCalc = (!entry.absorption_profile || entry.is_custom)
        ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false }
        : entry;
      return generateCarbCurve(forCalc);
    })
    .filter(Boolean);
  if (!curves.length) return null;

  const start = mealTime;
  let end = start;
  curves.forEach((c) => { if (c.length) end = Math.max(end, c[c.length - 1].time); });
  const STEP = 5 * 60 * 1000;
  let peakT = start;
  let peakRate = -1;
  for (let t = start; t <= end; t += STEP) {
    let rate = 0;
    curves.forEach((curve) => {
      for (let i = 0; i < curve.length - 1; i++) {
        if (curve[i].time <= t && curve[i + 1].time >= t) {
          const r = (t - curve[i].time) / (curve[i + 1].time - curve[i].time || 1);
          rate += curve[i].activity + (curve[i + 1].activity - curve[i].activity) * r;
          break;
        }
      }
    });
    if (rate > peakRate) { peakRate = rate; peakT = t; }
  }
  return peakT <= now ? Math.round((now - peakT) / 60000) : null;
}