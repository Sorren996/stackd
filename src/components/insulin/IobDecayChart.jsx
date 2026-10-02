import { useMemo, useState } from "react";
import { generateActivityCurve, getInsulinProfile } from "@/lib/insulinPharmacology";

const STEP_MS = 5 * 60 * 1000;

/**
 * Linearly interpolate the dose's activity at an arbitrary timestamp from a
 * pre-built canonical activity curve. The value read is `activityUnitsPerMinute`
 * — each dose's activity amplitude already scaled by its logged units, so the
 * curve height is proportional to units (a 20u dose reaches ~3.3x a 6u dose),
 * while the rise → peak → tail shape is unchanged. The canonical engine already
 * applies the ≤0.49u clearance floor to these curves, terminating them at 0.
 */
function activityAtTime(curve, t) {
  if (!curve || !curve.length) return 0;
  if (t <= curve[0].time) return 0;
  const last = curve[curve.length - 1];
  if (t >= last.time) return 0;
  for (let i = 0; i < curve.length - 1; i++) {
    if (t >= curve[i].time && t < curve[i + 1].time) {
      const span = curve[i + 1].time - curve[i].time;
      const a = Number(curve[i].activityUnitsPerMinute) || 0;
      const b = Number(curve[i + 1].activityUnitsPerMinute) || 0;
      if (span <= 0) return Math.max(0, a);
      const ratio = (t - curve[i].time) / span;
      return Math.max(0, a + (b - a) * ratio);
    }
  }
  return 0;
}

/**
 * Insulin activity chart — feeds the visualization from the existing canonical
 * activity engine (generateActivityCurve), NOT remaining-IOB data. Each dose's
 * curve amplitude is scaled by its logged units and plotted on ONE shared
 * y-axis (activity units per minute), so a larger dose renders visibly taller
 * than a smaller one while keeping the same rise → peak → tail shape. The live
 * IOB unit total is labelled separately above (in IobAtAGlance), not on the chart.
 *
 * Historical portion (up to NOW) is solid; projected tail (after NOW) is
 * dashed mustard. Per-dose curves keep pharmaceutical colors with translucent
 * fills and stepped opacity for same-type overlaps. Basal renders as a
 * separately labelled background band only when basal doses are present.
 * The per-bolus ≤0.49u clearance rule is applied consistently — the canonical
 * engine terminates each dose's activity curve at the floor time, so no
 * sub-threshold tail is drawn.
 */
export default function IobDecayChart({ bolusDoses, basalDoses, now = Date.now() }) {
  const W = 300;
  const H = 124;
  const padX = 10;
  const padTop = 18;
  const padBottom = 26;
  const basalBandH = 10;
  const [highlighted, setHighlighted] = useState(null);

  const model = useMemo(() => {
    const doseStarts = bolusDoses.map((d) => d.time).filter(Number.isFinite);
    const domainStart = doseStarts.length ? Math.min(...doseStarts) : now - 4 * 3600 * 1000;
    const domainEnd = now + 3 * 3600 * 1000;
    const domainMs = Math.max(1, domainEnd - domainStart);
    const toX = (t) => padX + ((t - domainStart) / domainMs) * (W - padX * 2);

    const timeSteps = [];
    for (let t = domainStart; t <= domainEnd; t += STEP_MS) timeSteps.push(t);

    // Build each dose's canonical activity curve ONCE (5-min steps).
    const doseObjs = bolusDoses.map((d) => ({
      insulin_type: d.type,
      units: d.units,
      administered_at: new Date(d.time).toISOString(),
    }));
    const curves = doseObjs.map((d) => generateActivityCurve(d, 5));

    // Per-dose activity (units-scaled) at each time step — amplitude is
    // proportional to the dose's logged units.
    const perDoseActivity = curves.map((curve) => timeSteps.map((t) => activityAtTime(curve, t)));
    // Total = point-wise sum of per-dose units-scaled activity.
    const totalActivity = timeSteps.map((_, i) => perDoseActivity.reduce((s, a) => s + a[i], 0));
    const maxActivity = Math.max(...totalActivity, 1);
    const plotH = H - padTop - padBottom - basalBandH - 4;
    const toY = (v) => padTop + (1 - v / maxActivity) * plotH;
    const baseY = padTop + plotH;

    const totalXY = timeSteps.map((t, i) => ({ x: toX(t), y: toY(totalActivity[i]) }));

    // Clip trailing zero points — keep one zero point for clean termination.
    let lastActiveTotal = totalActivity.length - 1;
    while (lastActiveTotal > 0 && totalActivity[lastActiveTotal] <= 0.001) lastActiveTotal--;
    const totalClipEnd = Math.min(lastActiveTotal + 2, totalXY.length);

    // NOW split: solid (historical) to NOW, dashed (projected) past NOW.
    const nowIdx = timeSteps.findIndex((t) => t >= now);
    const splitIdx = nowIdx === -1 ? totalClipEnd - 1 : Math.min(nowIdx, totalClipEnd - 1);
    const solidPts = totalXY.slice(0, Math.min(splitIdx + 1, totalClipEnd));
    const dashedPts = totalXY.slice(splitIdx, totalClipEnd);
    const totalSolid = solidPts.length >= 2 ? solidPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") : "";
    const totalDashed = dashedPts.length >= 2 ? dashedPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") : "";

    // Per-dose colors + opacity stepping for same-type overlaps.
    const typeCount = new Map();
    const doseMeta = bolusDoses.map((d, i) => {
      const typeKey = d.type || "Insulin";
      const sameTypeIdx = typeCount.get(typeKey) || 0;
      typeCount.set(typeKey, sameTypeIdx + 1);
      const color = getInsulinProfile(d.type)?.color || "#3f3830";
      const opacity = Math.max(0.32, 0.9 - sameTypeIdx * 0.22);
      const xy = timeSteps
        .map((t, j) => ({ x: toX(t), y: toY(perDoseActivity[i][j]), act: perDoseActivity[i][j] }))
        .filter((p) => Number.isFinite(p.y) && p.act > 0.001);
      const strokePath = xy.length >= 2 ? xy.map((p, k) => `${k ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") : "";
      const fillPath = xy.length >= 2
        ? `${strokePath} L ${xy[xy.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${xy[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`
        : "";
      return { idx: i, key: `actdose_${i}`, color, opacity, strokePath, fillPath };
    });

    // Dose markers (open rings) — hover isolates the dose curve.
    const doseMarkers = bolusDoses
      .map((d, i) => {
        if (!Number.isFinite(d.time) || d.time < domainStart || d.time > domainEnd) return null;
        const idx = timeSteps.findIndex((t) => t >= d.time);
        if (idx === -1) return null;
        return { x: toX(d.time), y: toY(perDoseActivity[i][idx]), color: doseMeta[i].color, idx: i };
      })
      .filter(Boolean);

    const nowX = toX(Math.min(now, domainEnd));
    const basalBandY = H - padBottom - basalBandH;

    // Time labels — leftmost (first dose) and rightmost (end), bottom lane.
    // NOW label is in a separate top lane so it can never collide with the
    // administration-time label at the bottom.
    const leftLabel = new Date(domainStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const rightLabel = new Date(domainEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return { totalSolid, totalDashed, doseMeta, doseMarkers, nowX, basalBandY, leftLabel, rightLabel };
  }, [bolusDoses, basalDoses, now]);

  const hasBasal = basalDoses && basalDoses.length > 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      style={{ display: "block" }}
      role="img"
      aria-label="Insulin activity curves over time, scaled to each dose's logged units on a shared scale. Solid line is activity already underway; dashed line projects the remaining tail."
    >
      {/* Translucent per-dose filled curves */}
      {model.doseMeta.map((m) => {
        if (!m.fillPath) return null;
        const dimmed = highlighted != null && highlighted !== m.idx;
        return (
          <path key={`fill_${m.key}`} d={m.fillPath} fill={m.color} fillOpacity={m.opacity * 0.18 * (dimmed ? 0.2 : 1)} stroke="none" />
        );
      })}
      {/* Solid per-dose stroke on top */}
      {model.doseMeta.map((m) => {
        if (!m.strokePath) return null;
        const dimmed = highlighted != null && highlighted !== m.idx;
        return (
          <path key={`stroke_${m.key}`} d={m.strokePath} fill="none" stroke={m.color} strokeWidth={1.5} strokeOpacity={m.opacity * (dimmed ? 0.2 : 1)} strokeLinecap="round" strokeLinejoin="round" />
        );
      })}

      {/* Total relative activity — solid (historical) to NOW */}
      {model.totalSolid && <path d={model.totalSolid} fill="none" stroke="#3f3830" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />}
      {/* Total relative activity — dashed mustard (projected) past NOW */}
      {model.totalDashed && <path d={model.totalDashed} fill="none" stroke="#af751b" strokeWidth={2.25} strokeDasharray="2 6" strokeLinecap="round" />}

      {/* NOW vertical line */}
      <line x1={model.nowX} y1={padTop} x2={model.nowX} y2={model.basalBandY} stroke="#3f3830" strokeWidth={1.25} opacity={0.5} />
      {/* NOW label — TOP lane, separate from bottom time labels to prevent collision */}
      <text x={model.nowX} y={padTop - 4} textAnchor="middle" fill="#6b6153" fontSize={9} fontWeight={600} letterSpacing="0.1em">NOW</text>

      {/* Dose markers (open rings) — hover isolates the dose curve */}
      {model.doseMarkers.map((m) => (
        <circle
          key={`marker_${m.idx}`}
          cx={m.x}
          cy={m.y}
          r={4.5}
          fill="#f7f1e8"
          stroke={m.color}
          strokeWidth={1.5}
          onMouseEnter={() => setHighlighted(m.idx)}
          onMouseLeave={() => setHighlighted(null)}
          style={{ cursor: "pointer" }}
        />
      ))}

      {/* Flat basal band — only when basal doses exist */}
      {hasBasal && (
        <>
          <rect x={padX} y={model.basalBandY} width={W - padX * 2} height={basalBandH} fill="#5b6550" opacity={0.10} rx={2} />
          <line x1={padX} y1={model.basalBandY + basalBandH + 1} x2={W - padX} y2={model.basalBandY + basalBandH + 1} stroke="#eadccf" strokeWidth={0.5} />
          <text x={padX + 2} y={model.basalBandY + basalBandH - 1} fill="#746959" fontSize={7} fontWeight={600} letterSpacing="0.12em">BASAL, STEADY BACKGROUND</text>
        </>
      )}

      {/* X-axis time labels — left (start) and right (end) only, bottom lane */}
      <text x={padX} y={H - 8} textAnchor="start" fill="#746959" fontSize={9}>
        {model.leftLabel}
      </text>
      <text x={W - padX} y={H - 8} textAnchor="end" fill="#746959" fontSize={9}>
        {model.rightLabel}
      </text>
    </svg>
  );
}