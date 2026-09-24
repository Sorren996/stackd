import { useMemo } from "react";
import { generateActivityCurve, isBasalInsulinType } from "@/lib/insulinPharmacology";

const W = 64;
const H = 22;

/**
 * Per-dose activity sparkline (rise → peak → long tail) from the shared
 * exponential (oref1) insulin model — the same math the Daily Flow insulin
 * row uses. Peak-normalized so every dose shows the full gentle rise-peak-tail
 * shape legibly regardless of size (the dose amount itself is shown as text
 * beside the sparkline). Basal doses render a flat coverage band. Consistent
 * with the Daily Flow insulin row's peak-normalized rendering.
 */
export default function MiniActivitySparkline({ dose, now = Date.now() }) {
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

    const toX = (t) => ((t - start) / span) * (W - 2) + 1;
    // `activity` is peak-normalized (0–1); fill the sparkline height so the
    // rise-peak-tail shape is fully visible for every dose.
    const toY = (a) => H - 2 - Math.max(0, Math.min(1, a)) * (H - 4);

    if (isBasal) {
      return { path: "", isBasal: true, nowX: toX(Math.min(now, end)), nowY: null };
    }

    const pts = curve.map((p) => ({ x: toX(p.time), y: toY(p.activity) }));
    const d = pts.length >= 2
      ? pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const nx = toX(Math.min(now, end));
    let na = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].time <= now && curve[i + 1].time >= now) {
        const r = (now - curve[i].time) / (curve[i + 1].time - curve[i].time || 1);
        na = curve[i].activity + (curve[i + 1].activity - curve[i].activity) * r;
        break;
      }
    }
    return { path: d, isBasal: false, nowX: nx, nowY: na > 0 ? toY(na) : null };
  }, [dose, now]);

  if (isBasal) {
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
      {nowY != null && <circle cx={nowX} cy={nowY} r={1.8} fill="currentColor" />}
    </svg>
  );
}