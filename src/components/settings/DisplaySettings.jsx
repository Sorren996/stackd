import { useUserSettings } from "@/hooks/useUserSettings";
import { LineChart, Check, Loader2, Gauge } from "lucide-react";
import {
  HIGH_REFERENCE_DEFAULT,
  HIGH_REFERENCE_MIN,
  HIGH_REFERENCE_MAX,
  HIGH_REFERENCE_STEP,
  getHighReferenceOptions,
} from "@/lib/glucoseStatus";

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

  const highOptions = getHighReferenceOptions();

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
                className={`w-full flex items-center gap-4 rounded-3xl border p-4 text-left transition active:scale-[0.99] ${
                  selected ? "border-teal-500/40 bg-teal-500/10" : "glass-card border-white/10 hover:bg-white/[0.04]"
                }`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${selected ? "border-teal-500/30 bg-teal-500/15" : "border-teal-500/20 bg-teal-500/10"}`}>
                  <LineChart className={`h-5 w-5 ${selected ? "text-teal-300" : "text-teal-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{opt.label}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
                {selected && <Check className="h-5 w-5 text-teal-300 shrink-0" />}
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
        <div className="glass-card border rounded-3xl p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-white/45">Secondary reference shown on Your Flow</span>
            <span className="text-2xl font-black text-amber-300">{currentHigh}<span className="ml-1 text-xs font-medium text-white/40">mg/dL</span></span>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {highOptions.map((v) => {
              const selected = v === currentHigh;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleSelectHigh(v)}
                  disabled={isSaving}
                  className={`h-9 min-w-[3rem] rounded-xl border px-2 text-xs font-semibold transition active:scale-95 ${
                    selected
                      ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                      : "border-white/8 bg-white/[0.03] text-white/45 hover:text-white/75"
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-white/35 leading-relaxed">
            Choose from {HIGH_REFERENCE_MIN}–{HIGH_REFERENCE_MAX} mg/dL in steps of {HIGH_REFERENCE_STEP}. This is a visual reference only — it never changes when glucose is considered high. Your target range stays separate.
          </p>
        </div>
      </div>

      <div className="glass-card border rounded-3xl p-4">
        <p className="text-xs text-white/50 leading-relaxed">
          Graph height sets the normal upper limit of your glucose graph across every Your Flow view —
          3 hour, 6 hour, 12 hour, and 24 hour. Your lower boundary stays at 40 mg/dL. Whenever a
          real reading rises above or dips below your chosen scale, the graph gently expands to
          show the true value without changing your saved preference.
        </p>
      </div>

      <p className="text-center text-[10px] text-white/25 px-4 leading-relaxed">
        These are display preferences only. They never change, round, or hide your actual glucose readings.
      </p>
    </div>
  );
}