import { useUserSettings } from "@/hooks/useUserSettings";
import { LineChart, Check, Loader2, Gauge, Droplets } from "lucide-react";
import {
  HIGH_REFERENCE_DEFAULT,
  HIGH_REFERENCE_MIN,
  HIGH_REFERENCE_MAX,
  HIGH_REFERENCE_STEP,
} from "@/lib/glucoseStatus";
import HighGlucosePicker from "@/components/settings/HighGlucosePicker";

const HEIGHT_OPTIONS = [
  { value: 300, label: "300 mg/dL", desc: "A closer view of your in-range rhythm." },
  { value: 400, label: "400 mg/dL", desc: "More headroom for highs while keeping your range centered." },
];

export default function DisplaySettings() {
  const { settings, isLoading, save, isSaving } = useUserSettings();
  const currentHeight = settings?.graph_height === 300 ? 300 : 400;
  const currentHigh = Number.isFinite(settings?.high_glucose_reference)
    ? Math.max(HIGH_REFERENCE_MIN, Math.min(HIGH_REFERENCE_MAX, Math.round(settings.high_glucose_reference / HIGH_REFERENCE_STEP) * HIGH_REFERENCE_STEP))
    : HIGH_REFERENCE_DEFAULT;
  const manualGlucoseEnabled = settings?.manual_glucose_logging_enabled !== false;

  const handleToggleManualGlucose = () => {
    if (isSaving) return;
    const next = !manualGlucoseEnabled;
    localStorage.setItem("manual_glucose_logging_enabled", String(next));
    window.dispatchEvent(new Event("insulin-settings-updated"));
    save({ manual_glucose_logging_enabled: next });
  };

  const handleSelectHeight = (value) => {
    if (value === currentHeight || isSaving) return;
    localStorage.setItem("graph_height", String(value));
    window.dispatchEvent(new Event("insulin-settings-updated"));
    window.dispatchEvent(new Event("target-range-updated"));
    save({ graph_height: value });
  };

  const handleSelectHigh = (value) => {
    if (value === currentHigh || isSaving) return;
    localStorage.setItem("high_glucose_reference", String(value));
    window.dispatchEvent(new Event("target-range-updated"));
    save({ high_glucose_reference: value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Graph Height</h3>
        <div className="space-y-3">
          {HEIGHT_OPTIONS.map((opt) => {
            const selected = opt.value === currentHeight;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelectHeight(opt.value)}
                disabled={isSaving}
                className="w-full flex items-center gap-4 rounded-3xl border p-4 text-left transition active:scale-[0.99]"
                style={selected
                  ? { background: "rgba(91,101,80,0.10)", borderColor: "rgba(91,101,80,0.40)" }
                  : { background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }
                }
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border" style={selected ? { borderColor: "rgba(91,101,80,0.30)", background: "rgba(91,101,80,0.15)" } : { borderColor: "rgba(91,101,80,0.20)", background: "rgba(91,101,80,0.08)" }}>
                  <LineChart className="h-5 w-5" style={{ color: "#5b6550" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{opt.label}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
                {selected && <Check className="h-5 w-5 shrink-0" style={{ color: "#5b6550" }} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Gauge className="h-4 w-4 text-amber-400/80" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">High Glucose Line</h3>
        </div>
        <div className="glass-card border rounded-3xl p-4" style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-white/45">Secondary reference shown on Your Flow</span>
            <span className="text-2xl font-black" style={{ color: "#af751b" }}>{currentHigh}<span className="ml-1 text-xs font-medium text-white/40">mg/dL</span></span>
          </div>
          <div className="mt-4">
            <HighGlucosePicker value={currentHigh} onChange={handleSelectHigh} />
          </div>
          <p className="mt-3 text-[11px] text-white/35 leading-relaxed">
            Choose from {HIGH_REFERENCE_MIN}–{HIGH_REFERENCE_MAX} mg/dL in steps of {HIGH_REFERENCE_STEP}. This is a visual reference only — it never changes when glucose is considered high. Your target range stays separate.
          </p>
        </div>
      </div>

      <div className="glass-card border rounded-3xl p-4" style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}>
        <p className="text-xs text-white/50 leading-relaxed">
          Graph height sets the normal upper limit of your glucose graph across every Your Flow view —
          3 hour, 6 hour, 12 hour, and 24 hour. Your lower boundary stays at 40 mg/dL. Whenever a
          real reading rises above or dips below your chosen scale, the graph gently expands to
          show the true value without changing your saved preference.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Droplets className="h-4 w-4" style={{ color: "#5b6550" }} />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Manual Glucose Logging</h3>
        </div>
        <button
          type="button"
          onClick={handleToggleManualGlucose}
          disabled={isSaving}
          className="glass-card border rounded-3xl p-4 w-full flex items-center justify-between gap-4 text-left transition active:scale-[0.99] hover:bg-white/[0.04]"
          style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Log glucose by hand</p>
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
              Show Glucose in the logging menu so you can add fingerstick readings. Turn off if your sensor provides readings automatically.
            </p>
          </div>
          <span
            className="relative h-7 w-12 shrink-0 rounded-full border transition-colors"
            style={{
              background: manualGlucoseEnabled
                ? "#5b6550"
                : "rgba(63, 56, 48, 0.10)",
              borderColor: manualGlucoseEnabled ? "#5b6550" : "#eadccf",
            }}
          >
            <span
              className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-md transition-all"
              style={{ left: manualGlucoseEnabled ? "calc(100% - 22px)" : "2px", background: manualGlucoseEnabled ? "#fdf9f2" : "#f7f1e8" }}
            />
          </span>
        </button>
      </div>

      <p className="text-center text-[10px] text-white/25 px-4 leading-relaxed">
        These are display preferences only. They never change, round, or hide your actual glucose readings.
      </p>
    </div>
  );
}