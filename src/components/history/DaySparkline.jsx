/**
 * DaySparkline — a miniature glucose curve for history list rows.
 * Renders a smooth-ish line + faint area from the day's readings.
 * Colored by the day's dominant status: sage (steady), mustard (mixed), clay (hard).
 * Gracefully empty when fewer than 2 readings are available.
 */
export default function DaySparkline({ readings, targetLow, targetHigh, width = 56, height = 22 }) {
  if (!readings || readings.length < 2) {
    return <div style={{ width, height }} className="shrink-0" />;
  }

  const pts = readings
    .map((r) => ({ v: Number(r.value), t: Number(r.time) }))
    .filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  if (pts.length < 2) return <div style={{ width, height }} className="shrink-0" />;

  const values = pts.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pad = 2.5;
  const innerH = height - pad * 2;

  const coords = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * (width - 2) + 1;
    const y = pad + (1 - (p.v - min) / span) * innerH;
    return [x, y];
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`;

  const inRange = values.filter((v) => v >= targetLow && v <= targetHigh).length;
  const ratio = inRange / values.length;
  const color = ratio >= 0.7 ? "#5b6550" : ratio >= 0.4 ? "#af751b" : "#c97060";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <path d={area} fill={color} fillOpacity={0.10} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}