import { ReportCard, StatGrid, val, unit, fmtDateShort, hourLabel } from "./reportShared";
import GlucoseCurve, { normX } from "./GlucoseCurve";

function toMarkers(markers, isBest) {
  const out = [];
  (markers?.carbs || []).forEach((m) =>
    out.push({ x: normX(m.min, 1440), kind: "carb", label: m.name, detail: `${m.carbs}g` })
  );
  (markers?.doses || []).forEach((m) =>
    out.push({ x: normX(m.min, 1440), kind: "dose", label: m.type, detail: `${m.units} u` })
  );
  return out;
}

function DayTile({ title, day, markers, reports }) {
  if (!day || !day.hasData) {
    return (
      <ReportCard title={title}>
        <p className="text-sm" style={{ color: "#6b6153" }}>No reportable glucose this day.</p>
      </ReportCard>
    );
  }
  const s = day.stats;
  const mk = toMarkers(markers, title === "Best day");
  return (
    <ReportCard title={title}>
      <div className="flex items-baseline justify-between">
        <span className="text-base font-semibold" style={{ color: "#3f3830" }}>{fmtDateShort(day.date)}</span>
        <span className="text-sm font-semibold text-sage-text">{day.tirPercent}% in target</span>
      </div>

      <div className="mt-3">
        <GlucoseCurve series={day.series} height={130} lineDots={day.series.length <= 48} />
        <div className="mt-1 flex w-full justify-between px-0.5 text-[9px] tabular-nums" style={{ color: "#746959" }}>
          <span>mid</span><span>6am</span><span>noon</span><span>6pm</span><span>mid</span>
        </div>
      </div>

      {mk.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {mk.slice(0, 10).map((m, i) => (
            <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: m.kind === "carb" ? "rgba(138,90,18,0.12)" : "rgba(63,56,48,0.10)", color: m.kind === "carb" ? "#8a5a12" : "#3f3830" }}>
              {m.kind === "carb" ? `${m.label} · ${m.detail}` : `${m.label} · ${m.detail}`}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4">
        <StatGrid
          cols={3}
          items={[
            { label: "Average", value: s?.mean ? `${val(s.mean)}` : "—" },
            { label: "Low–High", value: s ? `${val(s.min)}–${val(s.max)}` : "—" },
            { label: "S.D.", value: s?.sd ? `±${val(s.sd)}` : "—" },
          ]}
        />
      </div>
    </ReportCard>
  );
}

function RecurringTile({ p, reports }) {
  const isHigh = p.type === "high";
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(63,56,48,0.03)" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: "#3f3830" }}>
          {isHigh ? "Tends high" : "Tends low"}
        </span>
        <span className="text-xs font-semibold" style={{ color: isHigh ? "#8a5a12" : "#9c3f2e" }}>
          {p.windowLabel}
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "#746959" }}>
        Around {p.windowLabel}, your glucose leaned {isHigh ? "above" : "below"} target on {p.count} of {p.ofDays} days
        ({p.duration} consecutive hours). Recurring pattern.
      </p>
      {p.evidenceDates?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.evidenceDates.slice(0, 6).map((d) => (
            <span key={d} className="rounded-full px-2 py-0.5 text-[10px] tabular-nums" style={{ background: "#f0e8db", color: "#746959" }}>
              {fmtDateShort(d)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PatternsReport({ reports }) {
  const p = reports?.patterns;
  if (!p) return null;
  return (
    <div className="space-y-4">
      <DayTile title="Best day" day={p.bestDay} markers={p.bestDayMarkers} reports={reports} />
      {p.worstDay && p.worstDay.hasData && (
        <DayTile title="Hardest day" day={p.worstDay} markers={p.worstDayMarkers} reports={reports} />
      )}

      {(p.recurring || []).length > 0 ? (
        <ReportCard title="Recurring highs & lows">
          <div className="space-y-3">
            {p.recurring.map((r, i) => (
              <RecurringTile key={i} p={r} reports={reports} />
            ))}
          </div>
        </ReportCard>
      ) : (
        <ReportCard title="Recurring highs & lows">
          <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>
            No hour-of-day pattern repeated often enough to call a pattern in this range. That can be a good thing —
            it means your time isn't following one fixed rut.
          </p>
        </ReportCard>
      )}
    </div>
  );
}