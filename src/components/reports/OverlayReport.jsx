import { ReportCard, fmtDateShort } from "./reportShared";
import { normX } from "./GlucoseCurve";



// Overlay — each week's days layered on one 24-hour chart, one line per day.
// Sunday is the warmest, noisiest color and the other weekdays step down in
// warmth, so a glance shows which days quietly repeat and which leap around.
// Days with no data are skipped rather than leaving gaps.

const DAY_COLOR = {
  0: "#9c5228", // Sun — copper
  1: "#c9855f",
  2: "#b5973f",
  3: "#5b6550",
  4: "#8a8a5d",
  5: "#6b6153",
  6: "#746959",
};

export default function OverlayReport({ reports }) {
  const weeks = reports?.overlay || [];
  if (!weeks.length) {
    return (
      <ReportCard title="Weekday Overlay">
        <p className="text-sm" style={{ color: "#6b6153" }}>No Dexcom days to overlay in this range.</p>
      </ReportCard>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map((week, wi) => (
        <ReportCard key={wi} title={`Week of ${fmtDateShort(week.weekStart)}`}>
          <OverlayPanel week={week} />
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
            One line per day, left to right over 24 hours. Lines that stack tightly are your quietest, most familiar days.
          </p>
        </ReportCard>
      ))}
    </div>
  );
}

function OverlayPanel({ week }) {
  const days = week.days.filter((d) => d.hasData);
  if (!days.length) {
    return <p className="text-sm" style={{ color: "#6b6153" }}>No data this week.</p>;
  }

  const height = 170;
  const width = 320;
  const allVals = days.flatMap((d) => (d.series || []).filter((p) => typeof p?.value === "number").map((p) => p.value));
  if (!allVals.length) return null;
  const rawMin = Math.min(...allVals, 70);
  const rawMax = Math.max(...allVals, 180);
  const yMax = rawMax + 12;
  const yMin = Math.max(0, rawMin - 12);
  const padY = 5;
  const mapY = (v) => padY + ((yMax - v) / (yMax - yMin)) * (height - padY * 2);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {/* target band */}
        <rect x={0} y={0} width={width} height={Math.max(0, mapY(180))} fill="#8a5a12" opacity={0.08} />
        <rect x={0} y={mapY(180)} width={width} height={Math.max(0, mapY(70) - mapY(180))} fill="#5b6550" opacity={0.07} />
        <rect x={0} y={mapY(70)} width={width} height={Math.max(0, height - mapY(70))} fill="#9c3f2e" opacity={0.08} />

        {days.map((d, i) => {
          const vals = (d.series || []).filter((p) => typeof p?.value === "number");
          const pts = vals.map((p, idx) =>
            `${(normX(idx, vals.length) * width).toFixed(1)},${mapY(p.value).toFixed(1)}`
          ).join(" ");
          return (
            <g key={i}>
              <polyline
                points={pts}
                fill="none"
                stroke={DAY_COLOR[d.weekday] || "#746959"}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.85}
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex w-full justify-between px-0.5 text-[9px] tabular-nums" style={{ color: "#6b6153" }}>
        <span>mid</span><span>6am</span><span>noon</span><span>6pm</span><span>mid</span>
      </div>

      {/* weekday legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {week.days.map((d) => (
          <span key={d.date} className="flex items-center gap-1.5 text-[10px]" style={{ color: "#6b6153" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: DAY_COLOR[d.weekday] || "#eadccf", opacity: d.hasData ? 1 : 0.3 }} />
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.weekday]} {fmtDateShort(d.date)}
          </span>
        ))}
      </div>
    </div>
  );
}