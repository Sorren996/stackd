import { useMemo } from "react";
import { generateActivityCurve, isBasalInsulinType } from "@/lib/insulinPharmacology";

const W = 64;
const H = 22;

/**
 * A tiny per-dose activity sparkline computed from the existing exponential
 * (oref1) insulin model — the same math the Daily Flow graph uses. Bolus
 * doses render a peaked curve; basal doses render a flat coverage band.
 * Spent (0u) doses render greyed.
 */
export default function MiniActivitySparkline({ dose, now = Date.now() }) {
  const { path, isBasal, nowX, nowActivity } = useMemo(() => {
    const curve = generateActivityCurve(dose, 5);
    if (!curve.length) return { path: "", isBasal: false, nowX: 0, nowActivity: 0 };

    const isBasal = isBasalInsulinType(dose.insulin_type);
    const start = curve[0].time;
    const end = curve[curve.length - 1].time;
    const span = Math.max(1, end - start);

    const toX = (t) => (t - start) / span * (W - 2) + 1;
    const toY = (a) => H - 2 - a * (H - 4);

    if (isBasal) {
      // Flat coverage band — present all day, never a peak.
      return { path: "", isBasal: true, nowX: toX(Math.min(now, end)), nowActivity: 0 };
    }

    const pts = curve.map((p) => ({ x: toX(p.time), y: toY(p.activity) }));
    const d = pts.length >= 2
      ? pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const nx = toX(Math.min(now, end));
    // activity at now
    let na = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].time <= now && curve[i + 1].time >= now) {
        const r = (now - curve[i].time) / (curve[i + 1].time - curve[i].time || 1);
        na = curve[i].activity + (curve[i + 1].activity - curve[i].activity) * r;
        break;
      }
    }
    return { path: d, isBasal: false, nowX: nx, nowActivity: na };
  }, [dose, now]);

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
      {nowActivity > 0 && (
        <circle cx={nowX} cy={H - 2 - nowActivity * (H - 4)} r={1.8} fill="currentColor" />
      )}
    </svg>
  );
}