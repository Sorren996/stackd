import { useMemo } from "react";

const W = 260;
const H = 72;
const COPPER = "#9c5228";
const COPPER_LIGHT = "#9c5228";
const HAIRLINE = "#eadccf";
const INK = "#3f3830";

/**
 * Macro-informed predicted glucose response curve.
 * Renders the shape from generateMealGlucoseResponse — showing how the
 * meal's carb composition (simple vs complex vs high-fat/protein) shapes
 * the expected glucose rise, including any delayed secondary wave.
 *
 * Solid copper up to "now", dashed after. Light fill under the solid portion.
 * Editorial palette only — no gradients or decorative elements.
 */
export default function MealResponseCurve({ response, now = Date.now() }) {
  const { solidPath, dashedPath, fillPath, nowX, nowY } = useMemo(() => {
    const points = response?.points || [];
    if (!points.length) return { solidPath: "", dashedPath: "", fillPath: "", nowX: 0, nowY: 0 };

    const padX = 4;
    const padY = 6;
    const start = points[0].time;
    const end = points[points.length - 1].time;
    const span = end - start;
    const maxResp = Math.max(...points.map((p) => p.response), 1);

    const toX = (t) => padX + ((t - start) / span) * (W - padX * 2);
    const toY = (r) => H - padY - (r / maxResp) * (H - padY * 2);

    const nowClamped = Math.min(now, end);
    const splitIdx = points.findIndex((p) => p.time >= nowClamped);
    const idx = splitIdx === -1 ? points.length : splitIdx;

    const solidPts = points.slice(0, idx + 1).map((p) => ({ x: toX(p.time), y: toY(p.response) }));
    const dashedPts = points.slice(idx).map((p) => ({ x: toX(p.time), y: toY(p.response) }));

    const solid = solidPts.length >= 2
      ? solidPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const dashed = dashedPts.length >= 2
      ? dashedPts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
    const baseY = H - padY;
    const fill = solidPts.length >= 2
      ? `${solid} L ${solidPts[solidPts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${solidPts[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`
      : "";

    let nowResp = 0;
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i].time <= nowClamped && points[i + 1].time >= nowClamped) {
        const r = (nowClamped - points[i].time) / (points[i + 1].time - points[i].time || 1);
        nowResp = points[i].response + (points[i + 1].response - points[i].response) * r;
        break;
      }
    }

    return { solidPath: solid, dashedPath: dashed, fillPath: fill, nowX: toX(nowClamped), nowY: toY(nowResp) };
  }, [response, now]);

  if (!solidPath && !dashedPath) {
    return <div style={{ height: H }} />;
  }

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1={2} y1={H - 6} x2={W - 2} y2={H - 6} stroke={HAIRLINE} strokeWidth={0.75} />
      {fillPath && <path d={fillPath} fill={COPPER_LIGHT} fillOpacity={0.08} stroke="none" />}
      {solidPath && <path d={solidPath} fill="none" stroke={COPPER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {dashedPath && <path d={dashedPath} fill="none" stroke={COPPER} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 5" strokeLinecap="round" />}
      {nowX > 0 && (
        <>
          <line x1={nowX} y1={4} x2={nowX} y2={H - 6} stroke={INK} strokeWidth={0.75} strokeOpacity={0.3} />
          <circle cx={nowX} cy={nowY} r={3} fill={COPPER} />
        </>
      )}
    </svg>
  );
}