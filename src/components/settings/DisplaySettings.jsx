import { useUserSettings } from "@/hooks/useUserSettings";
import { LineChart, Check, Loader2 } from "lucide-react";

const OPTIONS = [
  { value: 300, label: "300 mg/dL", desc: "A closer view of your in-range rhythm." },
  { value: 400, label: "400 mg/dL", desc: "More headroom for highs while keeping your range centered." },
];

export default function DisplaySettings() {
  const { settings, isLoading, save, isSaving } = useUserSettings();
  const current = settings?.graph_height === 300 ? 300 : 400;

  const handleSelect = (value) => {
    if (value === current || isSaving) return;
    // Update the local cache immediately so Your Flow rescales without waiting
    // for the server round-trip. The saved preference remains authoritative.
    localStorage.setItem("graph_height", String(value));
    window.dispatchEvent(new Event("insulin-settings-updated"));
    window.dispatchEvent(new Event("target-range-updated"));
    save({ graph_height: value });
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
          {OPTIONS.map((opt) => {
            const selected = opt.value === current;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
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

      <div className="glass-card border rounded-3xl p-4">
        <p className="text-xs text-white/50 leading-relaxed">
          This sets the normal upper limit of your glucose graph across every Your Flow view —
          3 hour, 6 hour, 12 hour, and 24 hour. Your lower boundary stays at 40 mg/dL. Whenever a
          real reading rises above or dips below your chosen scale, the graph gently expands to
          show the true value without changing your saved preference.
        </p>
      </div>

      <p className="text-center text-[10px] text-white/25 px-4 leading-relaxed">
        This is a display preference only. It never changes, rounds, or hides your actual glucose readings.
      </p>
    </div>
  );
}