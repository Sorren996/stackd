import { useMemo } from "react";
import { generateCarbCurve } from "@/lib/carbAbsorption";

const W = 260;
const H = 76;
const COPPER = "#9c5228";
const COPPER_LIGHT = "#9c5228";
const HAIRLINE = "#eadccf";
const INK = "#3f3830";
const FAINT = "#746959";

function formatPeakLabel(peakMin) {
  if (peakMin < 60) return `Peak ~${Math.round(peakMin)}m`;
  const h = peakMin / 60;
  return `Peak ~${h % 1 === 0 ? h : h.toFixed(1)}h`;
}

/**
 * Absorption progress curve — renders the meal's combined carb absorption
 * rate (gamma-shaped, macro-aware) across the full dynamic window.
 *
 * Solid copper up to "now", dashed after. Light fill under the solid portion
 * shows cumulative progress. The peak is marked with a dashed vertical line
 * and a "Peak ~Xh" label, distinct from the "% absorbed" progress shown
 * separately. At 100 % the entire curve renders solid with a completion mark.
 */
export default function AbsorptionProgressCurve({ entries, mealTime, now = Date.now() }) {
  const { solidPath, dashedPath, fillPath, nowX, nowY, peakX, peakLabel, endX, isComplete } = useMemo(() => {
    const curves = (Array.isArray(entries) ? entries : [])
      .map((entry) => {
        if (!entry || !Number.isFinite(entry.carbs)) return null;
        const forCalc = (!entry.absorption_profile || entry.is_custom)
          ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false }
          : entry;
        return generateCarbCurve(forCalc);
      })
      .filter(Boolean);

    if (!curves.length) return { solidPath: "", dashedPath: "", fillPath: "", nowX: 0, nowY: 0, peakX: 0, peakLabel: "", endX: 0, isComplete: false };

    const start = mealTime;
    let end = start;
    curves.forEach((c) => { if (c.length) end = Math.max(end, c[c.length - 1].time); });
    if (end <= start) return { solidPath: "", dashedPath: "", fillPath: "", nowX: 0, nowY: 0, peakX: 0, peakLabel: "", endX: 0, isComplete: false };

    const span = end - start;
    const STEP = 3 * 60 * 1000;
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
    const toX = (t) => 4 + ((t - start) / span) * (W - 8);
    const toY = (r) => H - 8 - (r / maxRate) * (H - 16);

    // Find peak of the combined rate curve
    let peakIdx = 0;
    let peakRateVal = -1;
    samples.forEach((s, i) => { if (s.rate > peakRateVal) { peakRateVal = s.rate; peakIdx = i; } });
    const peakT = samples[peakIdx].t;
    const peakMin = (peakT - start) / 60000;

    // Now position
    const nowClamped = Math.min(now, end);
    const splitIdx = samples.findIndex((s) => s.t >= nowClamped);
    const idx = splitIdx === -1 ? samples.length : splitIdx;

    const solidPts = samples.slice(0, idx + 1).map((s) => ({ x: toX(s.t), y: toY(s.rate) }));
    const dashedPts = samples.slice(idx).map((s) => ({ x: toX(s.t), y: toY(s.rate) }));

    const solid = solidPts.length >= 2
      ? solidPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const dashed = dashedPts.length >= 2
      ? dashedPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const baseY = H - 8;
    const fill = solidPts.length >= 2
      ? `${solid} L ${solidPts[solidPts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${solidPts[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`
      : "";

    let nowResp = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].t <= nowClamped && samples[i + 1].t >= nowClamped) {
        const r = (nowClamped - samples[i].t) / (samples[i + 1].t - samples[i].t || 1);
        nowResp = samples[i].rate + (samples[i + 1].rate - samples[i].rate) * r;
        break;
      }
    }

    return {
      solidPath: solid,
      dashedPath: dashed,
      fillPath: fill,
      nowX: toX(nowClamped),
      nowY: toY(nowResp),
      peakX: toX(peakT),
      peakLabel: formatPeakLabel(peakMin),
      endX: toX(end),
      isComplete: nowClamped >= end,
    };
  }, [entries, mealTime, now]);

  if (!solidPath && !dashedPath) {
    return <div style={{ height: H }} />;
  }

  const baseY = H - 8;

  if (isComplete) {
    const fullPath = solidPath || dashedPath;
    return (
      <div className="relative">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
          <line x1={2} y1={baseY} x2={W - 2} y2={baseY} stroke={HAIRLINE} strokeWidth={0.75} />
          {fullPath && <path d={`${fullPath} L ${endX.toFixed(1)} ${baseY.toFixed(1)} L 4 ${baseY.toFixed(1)} Z`} fill={COPPER_LIGHT} fillOpacity={0.08} stroke="none" />}
          {fullPath && <path d={fullPath} fill="none" stroke={COPPER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {peakX > 0 && <line x1={peakX} y1={10} x2={peakX} y2={baseY} stroke={INK} strokeWidth={0.5} strokeOpacity={0.2} strokeDasharray="2 3" />}
          {endX > 0 && <circle cx={endX} cy={baseY} r={2.5} fill={COPPER} fillOpacity={0.5} />}
        </svg>
        {peakX > 0 && (
          <span className="absolute text-[8px] font-medium whitespace-nowrap" style={{ left: `${(peakX / W) * 100}%`, top: 0, transform: "translateX(-50%)", color: FAINT }}>
            {peakLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <line x1={2} y1={baseY} x2={W - 2} y2={baseY} stroke={HAIRLINE} strokeWidth={0.75} />
        {fillPath && <path d={fillPath} fill={COPPER_LIGHT} fillOpacity={0.08} stroke="none" />}
        {solidPath && <path d={solidPath} fill="none" stroke={COPPER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {dashedPath && <path d={dashedPath} fill="none" stroke={COPPER} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 5" strokeLinecap="round" />}
        {peakX > 0 && <line x1={peakX} y1={10} x2={peakX} y2={baseY} stroke={INK} strokeWidth={0.5} strokeOpacity={0.2} strokeDasharray="2 3" />}
        {nowX > 0 && (
          <>
            <line x1={nowX} y1={6} x2={nowX} y2={baseY} stroke={INK} strokeWidth={0.75} strokeOpacity={0.3} />
            <circle cx={nowX} cy={nowY} r={3} fill={COPPER} />
          </>
        )}
      </svg>
      {peakX > 0 && (
        <span className="absolute text-[8px] font-medium whitespace-nowrap" style={{ left: `${(peakX / W) * 100}%`, top: 0, transform: "translateX(-50%)", color: FAINT }}>
          {peakLabel}
        </span>
      )}
    </div>
  );
}