import { useUserSettings } from "@/hooks/useUserSettings";
import { Check, Loader2, Gauge, Droplets } from "lucide-react";
import {
  HIGH_REFERENCE_DEFAULT,
  HIGH_REFERENCE_MIN,
  HIGH_REFERENCE_MAX,
  HIGH_REFERENCE_STEP,
} from "@/lib/glucoseStatus";
import HighGlucosePicker from "@/components/settings/HighGlucosePicker";
import HairlineSection from "@/components/editorial/HairlineSection";

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
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#a89e8d" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HairlineSection label="Graph Height">
        <div className="space-y-3 pt-3 pb-2">
          {HEIGHT_OPTIONS.map((opt) => {
            const selected = opt.value === currentHeight;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelectHeight(opt.value)}
                disabled={isSaving}
                className="w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition active:scale-[0.99]"
                style={selected
                  ? { background: "rgba(91,101,80,0.10)", borderColor: "rgba(91,101,80,0.40)" }
                  : { background: "#fdf9f2", borderColor: "#eadccf" }
                }
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>{opt.label}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#a89e8d" }}>{opt.desc}</p>
                </div>
                {selected && <Check className="h-5 w-5 shrink-0" style={{ color: "#5b6550" }} />}
              </button>
            );
          })}
        </div>
      </HairlineSection>

      <HairlineSection label="High Glucose Line">
        <div className="pt-3 pb-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs" style={{ color: "#8a7f70" }}>Secondary reference on Your Flow</span>
            <span className="text-2xl font-bold" style={{ color: "#af751b" }}>{currentHigh}<span className="ml-1 text-xs font-medium" style={{ color: "#a89e8d" }}>mg/dL</span></span>
          </div>
          <div className="mt-4">
            <HighGlucosePicker value={currentHigh} onChange={handleSelectHigh} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "#a89e8d" }}>
            Choose from {HIGH_REFERENCE_MIN}–{HIGH_REFERENCE_MAX} mg/dL in steps of {HIGH_REFERENCE_STEP}. This is a visual reference only — it never changes when glucose is considered high. Your target range stays separate.
          </p>
        </div>
      </HairlineSection>

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "#a89e8d" }}>
        Graph height sets the normal upper limit of your glucose graph across every Your Flow view. Whenever a real reading rises above or dips below your chosen scale, the graph gently expands to show the true value without changing your saved preference.
      </p>

      <HairlineSection label="Manual Glucose">
        <button
          type="button"
          onClick={handleToggleManualGlucose}
          disabled={isSaving}
          className="w-full flex items-center justify-between gap-4 pt-3 pb-2 text-left transition active:opacity-70"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>Log glucose by hand</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#a89e8d" }}>
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
      </HairlineSection>

      <p className="px-1 text-[10px] leading-relaxed" style={{ color: "#b8aea0" }}>
        These are display preferences only. They never change, round, or hide your actual glucose readings.
      </p>
    </div>
  );
}