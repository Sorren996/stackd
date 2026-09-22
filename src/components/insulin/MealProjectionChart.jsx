import { useMemo } from "react";

/**
 * Meal projection chart — a compact SVG showing the glucose journey from
 * meal time through the review window. Solid ink curve to NOW, dashed
 * mustard projection past NOW, comfort zone sage fill, future zone
 * mustard rect, open-ring meal marker, NOW vertical line.
 *
 * Purely presentational — draws from scalar data points already computed
 * by the meal alignment logic. No new calculations.
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
}) {
  const W = 300;
  const H = 90;
  const padX = 8;
  const padTop = 10;
  const padBottom = 20;

  const { solidPath, dashedPath, points, nowX, mealX, comfortY, comfortH, futureRect } = useMemo(() => {
    const domainStart = mealTime;
    const domainEnd = reviewWindowEnd || mealTime + 4 * 3600 * 1000;
    const domainMs = Math.max(1, domainEnd - domainStart);

    // Y scale: 40 to max(250, peak + 20)
    const yMin = 40;
    const yMax = Math.max(250, (peakGlucose || 0) + 20, (startingGlucose || 0) + 20);
    const yRange = yMax - yMin;

    const toX = (t) => padX + ((t - domainStart) / domainMs) * (W - padX * 2);
    const toY = (v) => padTop + ((yMax - Math.min(Math.max(v, yMin), yMax)) / yRange) * (H - padTop - padBottom);

    // Build known glucose points
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

    // Dashed projection: from last known point to window end
    let dashed = "";
    if (xy.length >= 1) {
      const last = xy[xy.length - 1];
      const endX = toX(domainEnd);
      const endY = toY(Number.isFinite(currentGlucose) ? currentGlucose : (startingGlucose || 120));
      // Gentle curve toward target mid
      const midTarget = (targetLow + targetHigh) / 2;
      const midY = toY(midTarget);
      const midX = (last.x + endX) / 2;
      dashed = `M ${last.x.toFixed(1)} ${last.y.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
    }

    const nowX = toX(Math.min(now, domainEnd));
    const mealX = toX(mealTime);
    const comfortY = toY(targetHigh);
    const comfortH = Math.max(0, toY(targetLow) - toY(targetHigh));
    const futureRect = { x: nowX, y: padTop, w: W - padX - nowX, h: H - padTop - padBottom };

    return { solidPath: solid, dashedPath: dashed, points: xy, nowX, mealX, comfortY, comfortH, futureRect };
  }, [mealTime, reviewWindowEnd, startingGlucose, peakGlucose, peakTime, currentGlucose, targetLow, targetHigh, now]);

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

      {/* Dashed mustard projection past NOW */}
      {dashedPath && <path d={dashedPath} fill="none" stroke="#af751b" strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" />}

      {/* NOW vertical line */}
      <line x1={nowX} y1={padTop} x2={nowX} y2={H - padBottom} stroke="#3f3830" strokeWidth={1.25} opacity={0.6} />
      <text x={nowX} y={H - 6} textAnchor="middle" fill="#a89e8d" fontSize={9} fontWeight={600} letterSpacing="0.1em">NOW</text>

      {/* Meal marker — open ring */}
      <circle cx={mealX} cy={points[0]?.y ?? padTop} r={4} fill="#f7f1e8" stroke="#3f3830" strokeWidth={1.5} />

      {/* Glucose dots at known points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#5b6550" opacity={i === 0 ? 0 : 0.8} />
      ))}
    </svg>
  );
}