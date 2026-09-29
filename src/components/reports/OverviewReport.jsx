import { ReportCard, StatGrid, TirBand, val, unit, fmtDate, hourLabel } from "./reportShared";
import GlucoseCurve from "./GlucoseCurve";

// Overview — headline stats, time in range, insulin, and the full-range
// hour-by-hour glucose profile. Orientation-first so the reader gets a clear
// picture before the deeper reports.

export default function OverviewReport({ reports }) {
  const ov = reports?.overview;
  if (!ov) return null;
  const s = ov.stats;
  const hr = ov.stats?.hourBands || ov.hourBands || [];

  // Build an hourly median-curve series for the signature chart.
  const medianSeries = hr.map((b) => ({ value: b.p50 }));
  const p25Series = hr.map((b) => ({ value: b.p25 }));
  const p75Series = hr.map((b) => ({ value: b.p75 }));

  return (
    <div className="space-y-4">
      <ReportCard title="Overview">
        <StatGrid
          cols={2}
          items={[
            { label: "Average", value: `${val(s.mean)} ${unit()}`, hint: `GMI ≈ ${s.gmi ? s.gmi.toFixed(1) : "—"}%` },
            { label: "Standard deviation", value: `±${val(s.sd)} ${unit()}`, hint: `CV ${s.cv?.toFixed(0) ?? "—"}%` },
            { label: "Readings", value: s.count?.toLocaleString?.() ?? s.count, hint: `${ov.completeness?.timeActivePercent ?? "—"}% time active` },
            { label: "Lowest · Highest", value: `${val(s.min)} – ${val(s.max)} ${unit()}` },
          ]}
        />

        <div className="mt-6">
          <div className="section-label">Time in range</div>
          <div className="pt-3">
            <TirBand bands={ov.bands} />
          </div>
        </div>
      </ReportCard>

      <ReportCard title="Support dose summary">
        <StatGrid
          cols={2}
          items={[
            { label: "Total", value: `${ov.insulin?.totalUnits ?? "—"} u`, hint: `${ov.insulin?.doseCount ?? 0} doses` },
            { label: "Rapid-acting", value: `${ov.insulin?.rapidUnits ?? "—"} u`, hint: `${ov.insulin?.rapidPercent ?? 0}%` },
            { label: "Long-acting", value: `${ov.insulin?.longUnits ?? "—"} u`, hint: `${ov.insulin?.longPercent ?? 0}%` },
            { label: "Per day", value: `${ov.insulin?.avgPerDay ?? "—"} u` },
          ]}
        />
        {ov.bestDay && (
          <p className="mt-4 text-sm" style={{ color: "#6b6153" }}>
            Brightest day:{" "}
            <span className="font-semibold" style={{ color: "#3f3830" }}>
              {fmtDate(ov.bestDay.date)}
            </span>{" "}
            — {ov.bestDay.tirPercent}% in target.
          </p>
        )}
      </ReportCard>

      {hr.length > 0 && (
        <ReportCard title="The shape of your time">
          <div className="flex items-center gap-3">
            <div className="text-4xl font-light tabular-nums" style={{ color: "#3f3830" }}>
              {val(s.mean)}
              <span className="ml-1 text-base" style={{ color: "#6b6153" }}>{unit()}</span>
            </div>
            <div className="text-xs leading-tight" style={{ color: "#746959" }}>
              average across all hours
            </div>
          </div>

          <div className="mt-4">
            <GlucoseCurve
              series={medianSeries}
              height={140}
              showBands
            />
            <div className="mt-1 flex w-full justify-between px-0.5">
              <span className="text-[9px] tabular-nums" style={{ color: "#746959" }}>mid</span>
              <span className="text-[9px] tabular-nums" style={{ color: "#746959" }}>6am</span>
              <span className="text-[9px] tabular-nums" style={{ color: "#746959" }}>noon</span>
              <span className="text-[9px] tabular-nums" style={{ color: "#746959" }}>6pm</span>
              <span className="text-[9px] tabular-nums" style={{ color: "#746959" }}>mid</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "#746959" }}>Busiest hour</div>
              <div className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                {(() => {
                  const peak = hr.reduce((a, b) => (b.count > (a?.count ?? 0) ? b : a), null);
                  return peak ? `${hourLabel(peak.hour)} · ${peak.count} reads` : "—";
                })()}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "#746959" }}>Hours above target</div>
              <div className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                {(() => {
                  const above = hr.filter((b) => b.p50 > reports.targetHigh).length;
                  return above ? `${above} of 24` : "none median-wise";
                })()}
              </div>
            </div>
          </div>
        </ReportCard>
      )}
    </div>
  );
}