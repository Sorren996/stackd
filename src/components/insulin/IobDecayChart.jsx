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
 * curve is plotted on ONE shared y-axis with a FLOORED amplitude scale so a
 * larger dose still renders taller than a smaller one while every active dose
 * keeps a clearly visible rise → peak → tail shape (never flattening to a
 * near-invisible line when a much larger dose dominates). Per spec:
 *   amplitude = floorFraction + (1 - floorFraction) * (units / maxUnits among active doses)
 * The dose with the most units renders at full height; the smallest active
 * dose renders with at least `floorFraction` (~25%) of that height. The live
 * IOB unit total is labelled separately above (in IobAtAGlance), not on the
 * chart — this is a purely visual amplitude fix; the underlying dose/IOB math,
 * the ≤0.49u clearance floor, translucent fills, per-dose colors, and the
 * solid-underway vs dashed-mustard-projected-tail rendering are unchanged.
 *
 * Historical portion (up to NOW) is solid; projected tail (after NOW) is
 * dashed mustard. Per-dose curves keep pharmaceutical colors with translucent
 * fills and stepped opacity for same-type overlaps. Basal renders as a
 * separately labelled background band only when basal doses are present.
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
    // Build each dose's canonical activity curve ONCE (5-min steps).
    const doseObjs = bolusDoses.map((d) => ({
      insulin_type: d.type,
      units: d.units,
      administered_at: new Date(d.time).toISOString(),
    }));
    const curves = doseObjs.map((d) => generateActivityCurve(d, 5));

    // X-axis start: the earliest dose in view.
    const doseStarts = bolusDoses.map((d) => d.time).filter(Number.isFinite);
    const domainStart = doseStarts.length ? Math.min(...doseStarts) : now - 4 * 3600 * 1000;

    // X-axis end: when the LAST dose clears, per the 0.49u IOB floor rule.
    // Each canonical curve already terminates at its floor-clearance time (the
    // point where activity drops to 0). The end extends just past the last such
    // point so the axis hugs the active curves — no dead ~2h gap after them.
    // Falls back to now + 3h only when there are no dose curves to bound it.
    let latestClear = null;
    for (const curve of curves) {
      if (!Array.isArray(curve) || !curve.length) continue;
      for (let i = 0; i < curve.length; i++) {
        const act = Number(curve[i].activity) || 0;
        if (act > 0.001 && (latestClear == null || curve[i].time > latestClear)) {
          latestClear = curve[i].time;
        }
      }
    }
    const CLEAR_BUFFER_MS = 18 * 60 * 1000; // small breathing room past the last tail
    const domainEnd = latestClear != null
      ? latestClear + CLEAR_BUFFER_MS
      : now + 3 * 3600 * 1000;

    const domainMs = Math.max(1, domainEnd - domainStart);
    const toX = (t) => padX + ((t - domainStart) / domainMs) * (W - padX * 2);

    const timeSteps = [];
    for (let t = domainStart; t <= domainEnd; t += STEP_MS) timeSteps.push(t);

    // Per-dose raw activity (units-scaled by the canonical engine) at each
    // time step — its amplitude tracks the logged units, so a lone small dose
    // would otherwise flatten to near-invisible next to a much larger one.
    const perDoseRaw = curves.map((curve) => timeSteps.map((t) => activityAtTime(curve, t)));

    // FLOORED amplitude scale per dose. Instead of pure linear-from-zero, each
    // active dose's curve keeps a minimum visible height so its rise → peak →
    // tail shape stays readable even when another dose dwarfs it. The formula
    // (per spec): amplitude = floorFraction + (1 - floorFraction) * (units / maxUnits among active doses).
    // - The dose with the most units renders at full height (tallest).
    // - The smallest active dose still shows a clearly visible curve, never a flat line.
    // - Relative ordering (more units = visibly taller) is preserved between floor and full.
    const FLOOR_FRACTION = 0.25;
    const doseUnits = bolusDoses.map((d) => Number(d.units) || 0);
    const maxUnits = Math.max(...doseUnits, 1);
    const doseAmplitude = doseUnits.map((u) => FLOOR_FRACTION + (1 - FLOOR_FRACTION) * (u / maxUnits));

    // Normalize each dose's raw curve to its own peak (shape-preserving 0→1),
    // then re-scale to its floored amplitude so all curves share one y-axis
    // while keeping each dose's real rise → peak → tail geometry.
    const perDoseActivity = perDoseRaw.map((raw, i) => {
      const peak = Math.max(...raw, 0.0001);
      return raw.map((v) => (v / peak) * doseAmplitude[i]);
    });
    // Total = point-wise sum of the floored per-dose curves — one shared axis.
    const totalActivity = timeSteps.map((_, i) => perDoseActivity.reduce((s, a) => s + a[i], 0));
    // Axis top: the tallest dose renders at full height; if the combined total
    // slightly exceeds it at overlap peaks, let the axis expand so nothing clips.
    const maxActivity = Math.max(...totalActivity, ...doseAmplitude, 1);
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