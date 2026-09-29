import { useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import PageHeader from "@/components/editorial/PageHeader";
import { REPORT_TYPES, DISCLAIMER } from "./reportCatalog";

// Report Picker — the front door of the Reports engine. Pick a date range
// (presets or a custom number of days) and which reports you want, then
// Generate. Nothing heavy is fetched until you press Generate.

const PRESETS = [14, 30, 60, 90];

export default function ReportPicker({ onGenerate }) {
  const [windowDays, setWindowDays] = useState(30);
  const [customDays, setCustomDays] = useState("");
  const [selected, setSelected] = useState(() => new Set(["overview", "patterns", "daily", "agp"]));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else
      next.add(id);
      return next;
    });
  };

  const effectiveDays = (() => {
    if (customDays) {
      const n = Math.max(2, Math.min(90, Number(customDays) || 30));
      return Math.round(n);
    }
    return windowDays;
  })();

  const handleGenerate = () => {
    if (selected.size === 0) return;
    onGenerate({ windowDays: effectiveDays, reportIds: [...selected] });
  };

  const isNoneSelected = selected.size === 0;

  return (
    <div className="mx-auto max-w-md space-y-4 pb-36 pt-1">
      <PageHeader italicWord="reports" />

      {/* Step 1 — date range */}
      <DashboardCard className="p-4">
        <div className="section-label">1 · Choose a range</div>

        <div className="mt-2.5 inline-flex flex-wrap gap-2">
          {PRESETS.map((w) =>
          <button
            key={w}
            type="button"
            onClick={() => {setWindowDays(w);setCustomDays("");}}
            className="min-w-[54px] rounded-full px-3 py-1.5 text-xs font-semibold transition"
            style={{
              background: !customDays && windowDays === w ? "#3f3830" : "#f0e8db",
              color: !customDays && windowDays === w ? "#f7f1e8" : "#6b6153"
            }}
            aria-pressed={!customDays && windowDays === w}>
            
              {w} days
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: "#6b6153" }}>or custom</span>
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={90}
            placeholder="days (2–90)"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            className="w-32 rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ background: "#f7f1e8", borderColor: "#eadccf", color: "#3f3830" }} />
          
          {customDays &&
          <span className="text-xs tabular-nums" style={{ color: "#6b6153" }}>{effectiveDays} days</span>
          }
        </div>
      </DashboardCard>

      {/* Step 2 — which reports */}
      <DashboardCard className="p-4">
        <div className="section-label">2 · Pick your reports</div>
        <div className="mt-2.5 space-y-2">
          {REPORT_TYPES.map((r) => {
            const on = selected.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition"
                style={{ background: on ? "rgba(91,101,80,0.10)" : "rgba(63,56,48,0.03)" }}
                aria-pressed={on}>
                
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition"
                  style={{ background: on ? "#3f3830" : "#f0e8db" }}
                  aria-hidden="true">
                  
                  {on && <Check className="h-4 w-4" style={{ color: "#f7f1e8" }} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: "#3f3830" }}>{r.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: "#6b6153" }}>{r.description}</span>
                </span>
              </button>);

          })}
        </div>
      </DashboardCard>

      <p className="px-2 text-[11px] leading-relaxed text-center" style={{ color: "#f7f1e8" }}>
        {DISCLAIMER}
      </p>

      {/* Sticky Generate — raised above the bottom nav + FAB so it's never covered */}
      <div className="fixed inset-x-0 z-20 mx-auto max-w-md px-4 my-4" style={{ bottom: "calc(6.5rem + env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isNoneSelected}
          className="flex w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold transition active:opacity-80 disabled:opacity-50 py-5"
          style={{ background: "#3f3830", color: "#f7f1e8", boxShadow: "0 8px 28px rgba(63,56,48,0.20)" }}>
          
          Generate {effectiveDays}-day report
          <ChevronRight className="h-5 w-5" />
        </button>
        {isNoneSelected &&
        <p className="mt-2 text-center text-[11px]" style={{ color: "#6b6153" }}>Pick at least one report to continue.</p>
        }
      </div>
    </div>);

}