import { ReportCard, val, unit, fmtDateShort } from "./reportShared";
import GlucoseCurve, { normX } from "./GlucoseCurve";

// AGP — the standard Glucose Profile: a 5th–95th percentile band chart with
// median line plus the clinical targets, followed by a week-by-week texture
// grid of every day's glucose trace.

export default function AgpReport({ reports }) {
  const agp = reports?.agp;
  if (!agp) return null;
  const bands = agp.hourBands || [];
  const h = agp.headline || {};

  // The percentile envelope curves for the perimeter chart.
  const p5 = bands.map((b) => ({ value: b.p5 }));
  const p25 = bands.map((b) => ({ value: b.p25 }));
  const median = bands.map((b) => ({ value: b.p50 }));
  const p75 = bands.map((b) => ({ value: b.p75 }));
  const p95 = bands.map((b) => ({ value: b.p95 }));

  const daily = agp.dailyProfiles || [];

  return (
    <div className="space-y-4">
      <ReportCard title="Standard Glucose Profile">
        <div className="flex items-end gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "#746959" }}>Average</div>
            <div className="text-4xl font-light tabular-nums" style={{ color: "#3f3830" }}>
              {h.mean != null ? val(h.mean) : "—"}
              <span className="ml-1 text-base" style={{ color: "#6b6153" }}>{unit()}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "#746959" }}>GMI</div>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: "#3f3830" }}>{h.gmi != null ? `${h.gmi.toFixed(1)}%` : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "#746959" }}>Variability</div>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: "#3f3830" }}>{h.cv != null ? `${h.cv.toFixed(0)}%` : "—"}</div>
          </div>
        </div>

        {/* Percentile envelope: p5 and p95 as a filled cloud, median strong */}
        <div className="mt-5">
          {bands.length > 0 && (
            <DetergentEnvelope
              p5={p5} p95={p95} median={median}
              targetLow={reports.targetLow} targetHigh={reports.targetHigh}
            />
          )}
          <div className="mt-1 flex w-full justify-between px-0.5 text-[9px] tabular-nums" style={{ color: "#746959" }}>
            <span>mid</span><span>6am</span><span>noon</span><span>6pm</span><span>mid</span>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "#746959" }}>
          The ribbon shows where your glucose usually sits through the day — the middle line is your median hour by
          hour, and the widest edge is the 90% of the time you spent closest to it. Tightes, more predictable ribbons
          often feel calmer.
        </p>
      </ReportCard>

      <ReportCard title="Texture week by week">
        {daily.length === 0 ? (
          <p className="text-sm" style={{ color: "#6b6153" }}>No Dexcom days in this range.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {daily.map((d, i) => (
                <div key={i} className="rounded-md p-1" style={{ background: "rgba(63,56,48,0.03)" }}>
                  <GlucoseCurve series={d.series} height={46} showBands={false} strokeWidth={1.4} />
                  <div className="mt-0.5 truncate text-center text-[8px] tabular-nums" style={{ color: "#746959" }}>
                    {fmtDateShort(d.date)}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "#746959" }}>
              Each tile is one day across your full range, read left to right over the 24 hours. Weeks that look alike
              are the quietest, most predictable stretches.
            </p>
          </>
        )}
      </ReportCard>
    </div>
  );
}

// Draws the p5–p95 cloud as a filled polygon plus the strong median line.
function DetergentEnvelope({ p5, p95, median, targetLow, targetHigh }) {
  const width = 320;
  const height = 150;
  const padY = 6;
  const all = [...p5, ...p95, ...median].map((p) => p.value).filter(Number.isFinite);
  if (!all.length) return null;
  const rawMin = Math.min(...all, targetLow);
  const rawMax = Math.max(...all, targetHigh);
  const yMax = rawMax + 12;
  const yMin = Math.max(0, rawMin - 12);
  const yy = (v) => padY + ((yMax - v) / (yMax - yMin)) * (height - padY * 2);
  const x = (i) => normX(i, p5.length) * width;

  const top = p5.map((p, i) => `${x(i).toFixed(1)},${yy(p.value).toFixed(1)}`).join(" ");
  const bottom = [...p95].reverse().map((p, i) => {
    const idx = p95.length - 1 - i;
    return `${x(idx).toFixed(1)},${yy(p.value).toFixed(1)}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {/* range bands (fixed 70–180 per the app) */}
      <rect x={0} y={0} width={width} height={Math.max(0, yy(180))} fill="#8a5a12" opacity={0.10} />
      <rect x={0} y={yy(180)} width={width} height={Math.max(0, yy(70) - yy(180))} fill="#5b6550" opacity={0.08} />
      <rect x={0} y={yy(70)} width={width} height={Math.max(0, height - yy(70))} fill="#9c3f2e" opacity={0.10} />

      {/* envelope */}
      <polygon points={`${top} ${bottom}`} fill="#5b6550" opacity={0.22} />

      {/* median */}
      <polyline
        points={median.map((p, i) => `${x(i).toFixed(1)},${yy(p.value).toFixed(1)}`).join(" ")}
        fill="none" stroke="#3f3830" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}