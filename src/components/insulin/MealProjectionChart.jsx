import { useMemo } from "react";

/**
 * Meal projection chart — a compact SVG showing the glucose journey from
 * meal time through the review window. Solid ink curve to NOW, dashed
 * mustard projection past NOW using the ACTUAL engine trajectory (no
 * invented curve), comfort zone sage fill, future zone mustard rect,
 * open-ring meal marker, NOW vertical line.
 *
 * The dashed projection line comes exclusively from the real
 * GlucoseProjection trajectory (the same engine pipeline the Dashboard
 * uses). When no valid projection exists (abstained / insufficient data),
 * an honest "No projection yet" label is shown instead of a fabricated
 * curve.
 */
export default function MealProjectionChart({
  mealTime,
  reviewWindowEnd,
  startingGlucose,
  peakGlucose,
  peakTime,
  currentGlucose,
  targetLow,
  targetHigh,
  now = Date.now(),
  projectionTrajectory = null,
}) {
  const W = 300;
  const H = 90;
  const padX = 8;
  const padTop = 10;
  const padBottom = 20;

  const { solidPath, dashedPath, upperPath, lowerPath, points, nowX, mealX, comfortY, comfortH, futureRect, hasProjection } = useMemo(() => {
    const domainStart = mealTime;
    const domainEnd = reviewWindowEnd || mealTime + 4 * 3600 * 1000;
    const domainMs = Math.max(1, domainEnd - domainStart);

    // Y scale: 40 to max(250, peak + 20)
    const yMin = 40;
    const yMax = Math.max(250, (peakGlucose || 0) + 20, (startingGlucose || 0) + 20);
    const yRange = yMax - yMin;

    const toX = (t) => padX + ((t - domainStart) / domainMs) * (W - padX * 2);
    const toY = (v) => padTop + ((yMax - Math.min(Math.max(v, yMin), yMax)) / yRange) * (H - padTop - padBottom);

    // Build known glucose points (solid line: meal → now)
    const pts = [];
    if (Number.isFinite(startingGlucose)) pts.push({ t: mealTime, v: startingGlucose });
    if (Number.isFinite(peakGlucose) && Number.isFinite(peakTime) && peakTime > mealTime && peakTime < domainEnd) {
      pts.push({ t: peakTime, v: peakGlucose });
    }
    if (Number.isFinite(currentGlucose) && now > mealTime && now < domainEnd) {
      pts.push({ t: now, v: currentGlucose });
    }

    const xy = pts.map((p) => ({ x: toX(p.t), y: toY(p.v) }));

    // Solid path through known points up to NOW
    let solid = "";
    if (xy.length >= 2) {
      solid = xy.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    } else if (xy.length === 1) {
      solid = `M ${xy[0].x.toFixed(1)} ${xy[0].y.toFixed(1)}`;
    }

    // Dashed projection: use the REAL engine trajectory when available.
    // No invented curve — if the engine abstained or no projection exists,
    // the dashed line is empty (honest empty state).
    let dashed = "";
    let upper = "";
    let lower = "";
    let hasProj = false;

    if (projectionTrajectory && Array.isArray(projectionTrajectory) && projectionTrajectory.length >= 2) {
      const futurePoints = projectionTrajectory
        .map((p) => ({
          t: new Date(p.time).getTime(),
          v: Number(p.value),
          upper: Number(p.upper),
          lower: Number(p.lower),
        }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t >= domainStart && p.t <= domainEnd)
        .sort((a, b) => a.t - b.t);

      if (futurePoints.length >= 2) {
        hasProj = true;
        const projXY = futurePoints.map((p) => ({
          x: toX(p.t),
          y: toY(p.v),
          yUpper: Number.isFinite(p.upper) ? toY(p.upper) : null,
          yLower: Number.isFinite(p.lower) ? toY(p.lower) : null,
        }));

        // Connect to the last solid point for visual continuity
        const lastSolid = xy[xy.length - 1];
        const pathParts = [];
        if (lastSolid) {
          pathParts.push(`M ${lastSolid.x.toFixed(1)} ${lastSolid.y.toFixed(1)}`);
        }
        projXY.forEach((p) => {
          pathParts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
        });
        dashed = pathParts.join(" ");

        // Faint high/low lines (same palette as Dashboard ProjectionOverlay)
        const upperPts = projXY.filter((p) => p.yUpper != null);
        const lowerPts = projXY.filter((p) => p.yLower != null);
        if (upperPts.length >= 2) {
          upper = upperPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.yUpper.toFixed(1)}`).join(" ");
        }
        if (lowerPts.length >= 2) {
          lower = lowerPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.yLower.toFixed(1)}`).join(" ");
        }
      }
    }

    const nowX = toX(Math.min(now, domainEnd));
    const mealX = toX(mealTime);
    const comfortY = toY(targetHigh);
    const comfortH = Math.max(0, toY(targetLow) - toY(targetHigh));
    const futureRect = { x: nowX, y: padTop, w: W - padX - nowX, h: H - padTop - padBottom };

    return { solidPath: solid, dashedPath: dashed, upperPath: upper, lowerPath: lower, points: xy, nowX, mealX, comfortY, comfortH, futureRect, hasProjection: hasProj };
  }, [mealTime, reviewWindowEnd, startingGlucose, peakGlucose, peakTime, currentGlucose, targetLow, targetHigh, now, projectionTrajectory]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      {/* Future zone — faint mustard rect */}
      {futureRect.w > 1 && (
        <rect x={futureRect.x} y={futureRect.y} width={futureRect.w} height={futureRect.h} fill="#af751b" opacity={0.06} />
      )}

      {/* Comfort zone — sage 8% fill */}
      <rect x={padX} y={comfortY} width={W - padX * 2} height={comfortH} fill="#5b6550" opacity={0.08} />

      {/* Comfort zone dashed edges */}
      <line x1={padX} y1={comfortY} x2={W - padX} y2={comfortY} stroke="#5b6550" strokeWidth={0.5} strokeDasharray="2 3" opacity={0.3} />
      <line x1={padX} y1={comfortY + comfortH} x2={W - padX} y2={comfortY + comfortH} stroke="#5b6550" strokeWidth={0.5} strokeDasharray="2 3" opacity={0.3} />

      {/* Solid ink curve to NOW */}
      {solidPath && <path d={solidPath} fill="none" stroke="#3f3830" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

      {/* Dashed mustard projection from real engine trajectory */}
      {dashedPath && <path d={dashedPath} fill="none" stroke="#af751b" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" opacity={0.5} />}

      {/* Faint high line — muted amber */}
      {upperPath && <path d={upperPath} fill="none" stroke="#8a5a12" strokeWidth={1} strokeDasharray="3 3" opacity={0.3} />}

      {/* Faint low line — muted sage */}
      {lowerPath && <path d={lowerPath} fill="none" stroke="#4d5742" strokeWidth={1} strokeDasharray="3 3" opacity={0.3} />}

      {/* NOW vertical line */}
      <line x1={nowX} y1={padTop} x2={nowX} y2={H - padBottom} stroke="#3f3830" strokeWidth={1.25} opacity={0.6} />
      <text x={nowX} y={H - 6} textAnchor="middle" fill="#746959" fontSize={9} fontWeight={600} letterSpacing="0.1em">NOW</text>

      {/* Meal marker — open ring */}
      <circle cx={mealX} cy={points[0]?.y ?? padTop} r={4} fill="#f7f1e8" stroke="#3f3830" strokeWidth={1.5} />

      {/* Glucose dots at known points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#5b6550" opacity={i === 0 ? 0 : 0.8} />
      ))}

      {/* Honest empty state — no engine projection available */}
      {!hasProjection && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="#746959" fontSize={9} fontWeight={500}>
          No projection yet
        </text>
      )}
    </svg>
  );
}