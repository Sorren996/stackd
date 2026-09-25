import { useMemo, useState } from "react";
import { getDoseIOB, getInsulinProfile } from "@/lib/insulinPharmacology";

const STEP_MS = 5 * 60 * 1000;

/**
 * IOB decay chart — bold total bolus IOB line (point-wise sum of every
 * individual curve), plus translucent per-dose filled curves with a solid
 * stroke on top so overlapping doses stay individually distinguishable.
 *
 * Each dose curve keeps its pharmaceutical color; same-type overlaps step
 * opacity down so stacked curves don't merge into one line. The total IOB
 * line is the point-wise sum of all individual (real-unit) curves. Flat
 * basal band at the bottom. Hovering a dose marker isolates its curve.
 */
export default function IobDecayChart({ bolusDoses, basalDoses, now = Date.now() }) {
  const W = 300;
  const H = 110;
  const padX = 8;
  const padTop = 8;
  const padBottom = 22;
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

    const doseObjs = bolusDoses.map((d) => ({
      insulin_type: d.type,
      units: d.units,
      administered_at: new Date(d.time).toISOString(),
    }));

    // Per-dose IOB at each time step (real units) — the individual curves.
    const perDoseIOB = doseObjs.map((doseObj) => timeSteps.map((t) => getDoseIOB(doseObj, t)));
    // Total IOB = point-wise sum of every individual curve.
    const totalIOB = timeSteps.map((_, i) => perDoseIOB.reduce((s, d) => s + d[i], 0));
    const maxIOB = Math.max(...totalIOB, 1);
    const plotH = H - padTop - padBottom - basalBandH - 4;
    const toY = (v) => padTop + (1 - v / maxIOB) * plotH;
    const baseY = padTop + plotH;

    const totalXY = timeSteps.map((t, i) => ({ x: toX(t), y: toY(totalIOB[i]) }));
    const nowIdx = timeSteps.findIndex((t) => t >= now);
    const splitIdx = nowIdx === -1 ? timeSteps.length - 1 : nowIdx;
    const solidPts = totalXY.slice(0, splitIdx + 1);
    const dashedPts = totalXY.slice(splitIdx);
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
        .map((t, j) => ({ x: toX(t), y: toY(perDoseIOB[i][j]) }))
        .filter((p) => Number.isFinite(p.y) && p.y < H - padBottom);
      const strokePath = xy.length >= 2 ? xy.map((p, k) => `${k ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") : "";
      const fillPath = xy.length >= 2
        ? `${strokePath} L ${xy[xy.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${xy[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`
        : "";
      return { idx: i, key: `iobdose_${i}`, color, opacity, strokePath, fillPath };
    });

    const doseMarkers = bolusDoses
      .map((d, i) => {
        if (!Number.isFinite(d.time) || d.time < domainStart || d.time > domainEnd) return null;
        const idx = timeSteps.findIndex((t) => t >= d.time);
        if (idx === -1) return null;
        return { x: toX(d.time), y: toY(perDoseIOB[i][idx]), color: doseMeta[i].color, idx: i };
      })
      .filter(Boolean);

    const nowX = toX(Math.min(now, domainEnd));
    const basalBandY = H - padBottom - basalBandH;
    const labelTimes = [domainStart, now, domainEnd];
    const xLabels = labelTimes.map((t) => ({
      x: toX(t),
      label: new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    }));

    return { totalSolid, totalDashed, doseMeta, doseMarkers, nowX, basalBandY, xLabels };
  }, [bolusDoses, basalDoses, now]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
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

      {/* Bold total bolus IOB — solid to NOW */}
      {model.totalSolid && <path d={model.totalSolid} fill="none" stroke="#3f3830" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />}
      {/* Bold total bolus IOB — dashed mustard past NOW */}
      {model.totalDashed && <path d={model.totalDashed} fill="none" stroke="#af751b" strokeWidth={2.25} strokeDasharray="2 6" strokeLinecap="round" />}

      {/* NOW vertical line */}
      <line x1={model.nowX} y1={padTop} x2={model.nowX} y2={model.basalBandY} stroke="#3f3830" strokeWidth={1.25} opacity={0.5} />
      <text x={model.nowX} y={H - 4} textAnchor="middle" fill="#746959" fontSize={9} fontWeight={600} letterSpacing="0.1em">NOW</text>

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

      {/* Flat basal band */}
      <rect x={padX} y={model.basalBandY} width={W - padX * 2} height={basalBandH} fill="#5b6550" opacity={0.10} rx={2} />
      <line x1={padX} y1={model.basalBandY + basalBandH + 1} x2={W - padX} y2={model.basalBandY + basalBandH + 1} stroke="#eadccf" strokeWidth={0.5} />
      <text x={padX + 2} y={model.basalBandY + basalBandH - 1} fill="#746959" fontSize={7} fontWeight={600} letterSpacing="0.12em">BASAL, STEADY BACKGROUND</text>

      {/* X-axis tick labels */}
      {model.xLabels.map((l, i) => (
        <text key={`label_${i}`} x={l.x} y={H - 12} textAnchor={i === 0 ? "start" : i === model.xLabels.length - 1 ? "end" : "middle"} fill="#746959" fontSize={9}>
          {l.label}
        </text>
      ))}
    </svg>
  );
}