import { ReportCard, StatGrid, TirBand, val, unit, fmtDate } from "./reportShared";

// Compare — the selected range against the equal-length window immediately
// before it. Side-by-side stats, time in range, and support-doses summary.

function Band({ bands, title }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6b6153" }}>{title}</div>
      <TirBand bands={bands} compact />
    </div>
  );
}

function Side({ data, title, tag }) {
  const s = data?.stats;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold" style={{ color: "#3f3830" }}>{title}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: tag === "now" ? "rgba(91,101,80,0.15)" : "rgba(177,151,63,0.15)", color: tag === "now" ? "#4d5742" : "#8a5a12" }}>
          {tag === "now" ? "This stretch" : "The stretch before"}
        </span>
      </div>

      {!s ? (
        <p className="text-sm" style={{ color: "#6b6153" }}>Not enough Dexcom data for this window.</p>
      ) : (
        <>
          <StatGrid
            cols={2}
            items={[
              { label: "Average", value: `${val(s.mean)} ${unit()}`, hint: `GMI ${s.gmi?.toFixed?.(1) ?? "—"}%` },
              { label: "Variability", value: `±${val(s.sd)} ${unit()}` },
              { label: "CV", value: `${s.cv?.toFixed?.(0) ?? s.cv}%` },
              { label: "Readings", value: s.count?.toLocaleString?.() ?? s.count },
            ]}
          />
          <div className="mt-4">
            <Band bands={data.bands} title="Time in range" />
          </div>
          <div className="mt-4">
            <StatGrid
              cols={3}
              items={[
                { label: "Total", value: `${data.insulin?.totalUnits ?? "—"} u` },
                { label: "Per day", value: `${data.insulin?.avgPerDay ?? "—"} u` },
                { label: "Doses", value: `${data.insulin?.doseCount ?? 0}` },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function CompareReport({ reports }) {
  const c = reports?.compare;
  if (!c) return null;
  return (
    <div className="space-y-3">
      <ReportCard title="Two windows, side by side">
        <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>
          This range ({fmtDate(reports.rangeStart)} → {fmtDate(reports.rangeEnd)}) against the same length of time
          right before it ({fmtDate(reports.priorStart)} → {fmtDate(reports.priorEnd)}).
        </p>

        <div className="mt-5 border-t pt-5" style={{ borderColor: "#eadccf" }}>
          <Side data={c.current} title="This stretch" tag="now" />
        </div>
        <div className="mt-6 border-t pt-5" style={{ borderColor: "#eadccf" }}>
          <Side data={c.prior} title="The stretch before" tag="prior" />
        </div>
      </ReportCard>
    </div>
  );
}