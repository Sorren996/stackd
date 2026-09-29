import { format } from "date-fns";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";
import { DISCLAIMER } from "./reportCatalog";

// Band styling — Stackd's own status-indicator colors (sage etc.), not Clarity's.
export const BAND_STYLES = {
  veryLow: { label: "Very Low", bg: "#9c3f2e", display: "below 54" },
  low: { label: "Low", bg: "#c9855f", display: "54–69" },
  target: { label: "Target", bg: "#5b6550", display: "70–180" },
  high: { label: "High", bg: "#b5973f", display: "181–250" },
  veryHigh: { label: "Very High", bg: "#8a5a12", display: "above 250" },
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format an ISO date as "Sep 24, 2026". */
export function fmtDate(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!d || Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

export function fmtDateShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d");
}

/** 12-hour clock label for an hour-of-day column. */
export function hourLabel(h) {
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
}

/** Convert a raw mg/dL stat to display units (rounded once). */
export function val(stat) {
  return formatGlucose(stat);
}

export function unit() {
  return glucoseUnitLabel();
}

// ── Report header block (range, generated timestamp, display name) ──────
export function ReportHeader({ reports }) {
  const meta = reports?.meta || {};
  return (
    <div className="px-1">
      <div className="text-xs font-semibold" style={{ color: "#f7f1e8" }}>
        <span className="font-serif-italic" style={{ fontWeight: 400 }}>Stackd</span> Reports
      </div>
      <h2 className="mt-1 text-lg font-semibold" style={{ color: "#f7f1e8" }}>
        {fmtDate(reports.rangeStart)} — {fmtDate(reports.rangeEnd)}
      </h2>
      <p className="mt-1 text-xs" style={{ color: "#f7f1e8", opacity: 0.9 }}>
        {meta.displayName || "Stackd user"} · generated {meta.generatedAt ? fmtDate(meta.generatedAt) : "just now"}
        {meta.cgmSystem ? ` · ${meta.cgmSystem}` : ""}
      </p>
    </div>
  );
}

// ── Stat grid (label + value) ────────────────────────────────────────────
export function StatGrid({ items, cols = 2 }) {
  return (
    <div className={`grid grid-cols-${cols} gap-x-3 gap-y-4`}>
      {items.map((it, i) => (
        <div key={i}>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#6b6153" }}>
            {it.label}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "#3f3830" }}>
            {it.value}
          </div>
          {it.hint && <div className="mt-0.5 text-[11px]" style={{ color: "#6b6153" }}>{it.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// Pale, readable tint chips for the TIR bar — the app's sage-led accent
// colors rendered light so label text always meets contrast on cream.
const BAND_TINT = {
  veryLow: { bg: "rgba(156,63,46,0.12)", text: "#9c3f2e", dot: "#9c3f2e" },
  low: { bg: "rgba(201,133,95,0.16)", text: "#8a5a12", dot: "#c9855f" },
  target: { bg: "rgba(91,101,80,0.16)", text: "#4d5742", dot: "#5b6550" },
  high: { bg: "rgba(177,151,63,0.18)", text: "#8a5a12", dot: "#b5973f" },
  veryHigh: { bg: "rgba(156,63,46,0.12)", text: "#9c3f2e", dot: "#9c3f2e" },
};

// ── 5-band time-in-range bar, Stackd's sage-led colors ──────────────────
export function TirBand({ bands, compact = false }) {
  const ordered = ["veryLow", "low", "target", "high", "veryHigh"];
  const present = ordered
    .map((key) => ({ key, ...(BAND_STYLES[key] || {}), tint: BAND_TINT[key] || {}, percent: (bands || []).find((b) => b.key === key)?.percent ?? 0 }))
    .filter((b) => b.percent > 0);

  return (
    <div>
      <div
        className="flex h-8 w-full items-stretch overflow-hidden rounded-lg"
        role="img"
        aria-label="Time in range by band"
      >
        {present.length === 0 ? (
          <div className="w-full" style={{ background: "#f0e8db" }} />
        ) : (
          present.map((b) => (
            <div
              key={b.key}
              className="flex min-w-0 items-center justify-center"
              style={{ width: `${b.percent}%`, background: b.tint.bg }}
              title={`${b.label} ${b.percent}%`}
            >
              {b.percent >= 4 && (
                <span className="truncate px-0.5 text-[10px] font-bold" style={{ color: b.tint.text }}>
                  {b.percent}%
                </span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {ordered.map((key) => {
          const b = (bands || []).find((x) => x.key === key);
          const tint = BAND_TINT[key] || {};
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b ? tint.dot : "#eadccf" }} />
              <span className="text-[11px]" style={{ color: "#6b6153" }}>
                {BAND_STYLES[key].label} <span className="font-semibold tabular-nums" style={{ color: "#3f3830" }}>{b?.percent ?? 0}%</span>
              </span>
            </div>
          );
        })}
      </div>
      {!compact && (
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
          Bands use your target range for the "Target" band; above/below thresholds follow the standard 54 / 70 / 180 / 250 convention.
        </p>
      )}
    </div>
  );
}

// ── Empty-state helper for reports with nothing to show ─────────────────
export function ReportEmpty({ message }) {
  return (
    <div className="rounded-2xl px-4 py-10 text-center" style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63,56,48,0.06)" }}>
      <p className="text-sm font-medium" style={{ color: "#6b6153" }}>{message}</p>
    </div>
  );
}

// ── Card wrapper (cream, rounded, shadow, no border) ────────────────────
export function ReportCard({ title, children, className = "" }) {
  return (
    <div
      className={`rounded-[22px] ${className}`}
      style={{ background: "#fdf9f2", boxShadow: "0 8px 28px rgba(63,56,48,0.10)" }}
    >
      <div className="p-4">
        {title && <div className="section-label">{title}</div>}
        <div className={title ? "pt-2.5" : ""}>{children}</div>
      </div>
    </div>
  );
}

// ── Footer disclaimer, required on every report page ────────────────────
export function ReportFooter() {
  return (
    <p className="px-2 text-[11px] leading-relaxed text-center" style={{ color: "#6b6153" }}>
      {DISCLAIMER}
    </p>
  );
}