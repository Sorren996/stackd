import { useMemo } from "react";
import { getDoseIOB } from "@/lib/insulinPharmacology";

const STEP_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * IOB decay curves — bold total bolus IOB line, thin individual dose curves,
 * dashed mustard projection past NOW, flat basal band at the bottom.
 *
 * Computes IOB at each time step using the same getDoseIOB model the graph
 * uses. Purely presentational.
 */
export default function IobDecayChart({ bolusDoses, basalDoses, now = Date.now() }) {
  const W = 300;
  const H = 110;
  const padX = 8;
  const padTop = 8;
  const padBottom = 22;
  const basalBandH = 10;

  const { totalPath, dosePaths, dashedPath, nowX, doseMarkers, basalBandY, xLabels } = useMemo(() => {
    // Time range: from earliest dose to latest dose end + 2h, or now + 3h
    const doseStarts = bolusDoses.map((d) => d.time).filter(Number.isFinite);
    const domainStart = doseStarts.length ? Math.min(...doseStarts) - 30 * MINUTE_MS : now - 4 * 3600 * 1000;
    const domainEnd = now + 3 * 3600 * 1000;
    const domainMs = Math.max(1, domainEnd - domainStart);

    const toX = (t) => padX + ((t - domainStart) / domainMs) * (W - padX * 2);

    // Compute IOB at each time step for each dose
    const timeSteps = [];
    for (let t = domainStart; t <= domainEnd; t += STEP_MS) {
      timeSteps.push(t);
    }

    // Reconstruct dose-like objects for getDoseIOB
    const doseObjs = bolusDoses.map((d) => ({
      insulin_type: d.type,
      units: d.units,
      administered_at: new Date(d.time).toISOString(),
    }));

    // Per-dose IOB at each time step
    const perDoseIOB = doseObjs.map((doseObj) =>
      timeSteps.map((t) => getDoseIOB(doseObj, t))
    );

    // Total bolus IOB at each time step
    const totalIOB = timeSteps.map((_, i) =>
      perDoseIOB.reduce((sum, doseIOB) => sum + doseIOB[i], 0)
    );

    const maxIOB = Math.max(...totalIOB, 1);
    const plotH = H - padTop - padBottom - basalBandH - 4;
    const toY = (v) => padTop + (1 - v / maxIOB) * plotH;

    // Total path (solid to NOW, dashed past NOW)
    const totalXY = timeSteps.map((t, i) => ({ x: toX(t), y: toY(totalIOB[i]) }));
    const nowIdx = timeSteps.findIndex((t) => t >= now);
    const splitIdx = nowIdx === -1 ? timeSteps.length - 1 : nowIdx;

    const solidPts = totalXY.slice(0, splitIdx + 1);
    const dashedPts = totalXY.slice(splitIdx);

    const totalSolid = solidPts.length >= 2
      ? solidPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const totalDashed = dashedPts.length >= 2
      ? dashedPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";

    // Per-dose paths (thin lines)
    const dosePaths = perDoseIOB.map((doseIOB, di) => {
      const xy = timeSteps.map((t, i) => ({ x: toX(t), y: toY(doseIOB[i]) }));
      const valid = xy.filter((p) => Number.isFinite(p.y) && p.y < H - padBottom);
      if (valid.length < 2) return "";
      return valid.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    });

    // Dose markers (open rings at each dose time)
    const doseMarkers = bolusDoses
      .map((d, i) => {
        if (!Number.isFinite(d.time) || d.time < domainStart || d.time > domainEnd) return null;
        const idx = timeSteps.findIndex((t) => t >= d.time);
        if (idx === -1) return null;
        return { x: toX(d.time), y: toY(perDoseIOB[i][idx]) };
      })
      .filter(Boolean);

    const nowX = toX(Math.min(now, domainEnd));
    const basalBandY = H - padBottom - basalBandH;

    // X-axis labels
    const labelTimes = [domainStart, now, domainEnd];
    const xLabels = labelTimes.map((t) => ({
      x: toX(t),
      label: new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    }));

    return { totalPath: totalSolid, dosePaths, dashedPath: totalDashed, nowX, doseMarkers, basalBandY, xLabels };
  }, [bolusDoses, basalDoses, now]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      {/* Thin individual dose curves */}
      {dosePaths.map((path, i) => (
        <path key={`dose_${i}`} d={path} fill="none" stroke="#3f3830" strokeWidth={1.5} opacity={0.25} strokeLinecap="round" />
      ))}

      {/* Bold total bolus IOB — solid to NOW */}
      {totalPath && <path d={totalPath} fill="none" stroke="#3f3830" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />}

      {/* Bold total bolus IOB — dashed mustard past NOW */}
      {dashedPath && <path d={dashedPath} fill="none" stroke="#af751b" strokeWidth={2.25} strokeDasharray="2 6" strokeLinecap="round" />}

      {/* NOW vertical line */}
      <line x1={nowX} y1={padTop} x2={nowX} y2={basalBandY} stroke="#3f3830" strokeWidth={1.25} opacity={0.5} />
      <text x={nowX} y={H - 4} textAnchor="middle" fill="#a89e8d" fontSize={9} fontWeight={600} letterSpacing="0.1em">NOW</text>

      {/* Open-ring markers at each dose time */}
      {doseMarkers.map((m, i) => (
        <circle key={`marker_${i}`} cx={m.x} cy={m.y} r={4} fill="#f7f1e8" stroke="#3f3830" strokeWidth={1.5} />
      ))}

      {/* Flat basal band */}
      <rect x={padX} y={basalBandY} width={W - padX * 2} height={basalBandH} fill="#5b6550" opacity={0.10} rx={2} />
      <line x1={padX} y1={basalBandY + basalBandH + 1} x2={W - padX} y2={basalBandY + basalBandH + 1} stroke="#eadccf" strokeWidth={0.5} />
      <text x={padX + 2} y={basalBandY + basalBandH - 1} fill="#a89e8d" fontSize={7} fontWeight={600} letterSpacing="0.12em">BASAL · STEADY BACKGROUND</text>

      {/* X-axis tick labels */}
      {xLabels.map((l, i) => (
        <text key={`label_${i}`} x={l.x} y={H - 12} textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"} fill="#a89e8d" fontSize={9}>
          {l.label}
        </text>
      ))}
    </svg>
  );
}