import { ReportCard, val, unit, fmtDateShort } from "./reportShared";
import GlucoseCurve, { normX } from "./GlucoseCurve";

// Daily — a full walk through each day's glucose, with nourishments and
// support doses marked along the curve and an events table below. Most recent
// day first; Sunday starts each week grouping for reading comfort.

function timeOf(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const am = h < 12;
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}${am ? "a" : "p"}`;
}

export default function DailyReport({ reports }) {
  const pages = reports?.daily?.pages || [];
  if (!pages.length) {
    return (
      <ReportCard title="Daily">
        <p className="text-sm" style={{ color: "#6b6153" }}>No reportable days in this range.</p>
      </ReportCard>
    );
  }

  return (
    <div className="space-y-4">
      {pages.map((page, pi) => {
        const s = page.stats;
        return (
          <ReportCard key={pi}>
            <DayPage page={page} reports={reports} />
          </ReportCard>
        );
      })}
    </div>
  );
}

function DayPage({ page, reports }) {
  const markers = [];
  (page.markers?.carbs || []).forEach((m) => markers.push({ x: normX(m.min, 1440), kind: "carb", t: m.time, label: `${m.name || "Meal"} · ${m.carbs}g` }));
  (page.markers?.doses || []).forEach((m) => markers.push({ x: normX(m.min, 1440), kind: "dose", t: m.time, label: `${m.type || "Dose"} · ${Math.round(m.units * 10) / 10}u` }));
  markers.sort((a, b) => (a.t || "").localeCompare(b.t || ""));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-base font-semibold" style={{ color: "#3f3830" }}>{fmtDateShort(page.date)}</span>
        <span className="text-sm font-semibold text-sage-text">{page.tirPercent}% in target</span>
      </div>

      <div className="mt-3">
        <GlucoseCurve series={page.series} height={150} lineDots={page.series.length <= 48} markers={markers} />
        <div className="mt-1 flex w-full justify-between px-0.5 text-[9px] tabular-nums" style={{ color: "#746959" }}>
          <span>mid</span><span>6am</span><span>noon</span><span>6pm</span><span>mid</span>
        </div>
      </div>

      {markers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {markers.slice(0, 14).map((m, i) => (
            <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: m.kind === "carb" ? "rgba(138,90,18,0.12)" : "rgba(63,56,48,0.10)",
                color: m.kind === "carb" ? "#8a5a12" : "#3f3830",
              }}>
              <span className="tabular-nums" style={{ color: "#746959" }}>{timeOf(m.t)}</span> · {m.label}
            </span>
          ))}
        </div>
      )}

      {Array.isArray(page.events) && page.events.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl" style={{ boxShadow: "inset 0 1px 0 #eadccf" }}>
          {page.events.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: i === 0 ? "none" : "1px dashed #eadccf" }}>
              <div className="min-w-0">
                <span className="text-xs font-semibold tabular-nums" style={{ color: "#746959" }}>{timeOf(e.time)}</span>
                <span className="ml-2 text-xs font-medium" style={{ color: "#3f3830" }}>{e.type}</span>
                {e.details && <span className="ml-1 truncate text-xs" style={{ color: "#6b6153" }}>· {e.details}</span>}
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "#6b6153" }}>{e.valueText}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}