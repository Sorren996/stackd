import { useMemo } from "react";
import { generateActivityCurve, isBasalInsulinType } from "@/lib/insulinPharmacology";

const W = 64;
const H = 22;

/**
 * A tiny per-dose activity sparkline computed from the existing exponential
 * (oref1) insulin model — the same math the Daily Flow graph uses. Bolus
 * doses render a peaked curve; basal doses render a flat coverage band.
 * Spent (0u) doses render greyed.
 *
 * Dose-proportional: the curve is plotted in real units (units ×
 * activityFraction(t)) against a shared max passed from the parent card, so
 * a 40u dose sparkline peaks ~6.7× taller than a 6u dose — matching the
 * Daily Flow insulin row's dose-proportional rule.
 */
export default function MiniActivitySparkline({ dose, now = Date.now(), sharedMax = 1 }) {
  const { path, isBasal, nowX, nowY } = useMemo(() => {
    // Breakdown doses carry { type, units, time }; reconstruct a full
    // dose-like object so the shared exponential model can build the curve.
    const doseObj = {
      insulin_type: dose?.insulin_type || dose?.type,
      units: dose?.units,
      administered_at: new Date(dose?.time ?? dose?.administered_at).toISOString(),
    };
    const curve = generateActivityCurve(doseObj, 5);
    if (!curve.length) return { path: "", isBasal: false, nowX: 0, nowY: null };

    const isBasal = isBasalInsulinType(doseObj.insulin_type);
    const start = curve[0].time;
    const end = curve[curve.length - 1].time;
    const span = Math.max(1, end - start);

    const toX = (t) => (t - start) / span * (W - 2) + 1;
    const toY = (aupm) => H - 2 - (sharedMax > 0 ? aupm / sharedMax : 0) * (H - 4);

    if (isBasal) {
      // Flat coverage band — present all day, never a peak.
      return { path: "", isBasal: true, nowX: toX(Math.min(now, end)), nowY: null };
    }

    const pts = curve.map((p) => ({ x: toX(p.time), y: toY(p.activityUnitsPerMinute) }));
    const d = pts.length >= 2
      ? pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const nx = toX(Math.min(now, end));
    let naAupm = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].time <= now && curve[i + 1].time >= now) {
        const r = (now - curve[i].time) / (curve[i + 1].time - curve[i].time || 1);
        naAupm = curve[i].activityUnitsPerMinute + (curve[i + 1].activityUnitsPerMinute - curve[i].activityUnitsPerMinute) * r;
        break;
      }
    }
    return { path: d, isBasal: false, nowX: nx, nowY: naAupm > 0 ? toY(naAupm) : null };
  }, [dose, now, sharedMax]);

  if (isBasal) {
    // Flat coverage band
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <rect x={1} y={H - 6} width={W - 2} height={4} rx={2} fill="#5b6550" opacity={0.18} />
      </svg>
    );
  }

  if (!path) return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} />;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {nowY != null && (
        <circle cx={nowX} cy={nowY} r={1.8} fill="currentColor" />
      )}
    </svg>
  );
}