import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { X, Syringe, Droplets } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_ORDER = ["Rapid-Acting", "Short-Acting", "Intermediate", "Long-Acting", "Ultra Long-Acting"];

const groupedInsulins = CATEGORY_ORDER.reduce((acc, cat) => {
  const items = Object.entries(INSULIN_PROFILES).filter(([, p]) => p.category === cat);
  if (items.length) acc.push({ category: cat, items });
  return acc;
}, []);

const GLUCOSE_PRESETS = [70, 100, 120, 140, 180, 200, 250];

export default function DoseForm({ open, onOpenChange }) {
  const [tab, setTab] = useState("insulin");
  // Insulin state
  const [insulinType, setInsulinType] = useState("");
  const [units, setUnits] = useState(10);
  const [insulinNotes, setInsulinNotes] = useState("");
  // Glucose state
  const [glucoseValue, setGlucoseValue] = useState(100);
  const [glucoseNotes, setGlucoseNotes] = useState("");
  const [glucoseTime, setGlucoseTime] = useState(() => {
    const now = new Date();
    return now.toTimeString().slice(0, 5); // "HH:MM"
  });
  const queryClient = useQueryClient();

  const createDose = useMutation({
    mutationFn: (data) => base44.entities.InsulinDose.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose logged — tracking activity now");
      onOpenChange(false);
      setInsulinType(""); setUnits(10); setInsulinNotes("");
    }
  });

  const createGlucose = useMutation({
    mutationFn: (data) => base44.entities.GlucoseReading.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Glucose logged");
      onOpenChange(false);
      setGlucoseValue(100); setGlucoseNotes("");
      setGlucoseTime(new Date().toTimeString().slice(0, 5));
    }
  });

  const profile = insulinType ? INSULIN_PROFILES[insulinType] : null;
  const accentColor = profile?.color || "#2dd4bf";
  const glucoseColor = "#f97316";

  const handleSubmitInsulin = () => {
    if (!insulinType || !units) return;
    createDose.mutate({
      insulin_type: insulinType,
      units: parseFloat(units),
      administered_at: new Date().toISOString(),
      notes: insulinNotes || undefined
    });
  };

  const handleSubmitGlucose = () => {
    if (!glucoseValue) return;
    // Build a datetime from today's date + the chosen time
    const [h, m] = glucoseTime.split(":").map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    createGlucose.mutate({
      value: parseFloat(glucoseValue),
      recorded_at: dt.toISOString(),
      notes: glucoseNotes || undefined
    });
  };

  const adjust = (delta) => setUnits((u) => Math.max(0.5, Math.round((u + delta) * 2) / 2));
  const adjustGlucose = (delta) => setGlucoseValue((v) => Math.min(400, Math.max(40, v + delta)));
  const shortName = insulinType ? insulinType.split(" ")[0] : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-md w-full sm:rounded-3xl overflow-hidden border-0"
        style={{ background: "hsl(162,10%,8%)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div className="flex items-center justify-center relative px-6 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-white text-lg font-semibold">Log Entry</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute left-5 top-5 text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mx-5 mb-2 rounded-2xl p-1 shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
          <button
            onClick={() => setTab("insulin")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === "insulin" ? "text-white" : "text-white/40"}`}
            style={tab === "insulin" ? { background: "rgba(255,255,255,0.12)" } : {}}>
            <Syringe className="w-4 h-4" />
            Insulin
          </button>
          <button
            onClick={() => setTab("glucose")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === "glucose" ? "text-white" : "text-white/40"}`}
            style={tab === "glucose" ? { background: `${glucoseColor}33` } : {}}>
            <Droplets className="w-4 h-4" style={{ color: tab === "glucose" ? glucoseColor : undefined }} />
            <span style={{ color: tab === "glucose" ? glucoseColor : undefined }}>Glucose</span>
          </button>
        </div>

        {tab === "insulin" ? (
          <>
            {/* Scrollable insulin body */}
            <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-6">
              {/* Insulin Type */}
              <div>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">Insulin Type</p>
                <div className="space-y-3">
                  {groupedInsulins.map(({ category, items }) => (
                    <div key={category}>
                      <p className="text-xs text-white/40 mb-2">{category}</p>
                      <div className="flex flex-wrap gap-2">
                        {items.map(([name, p]) => {
                          const shortLabel = name.split(" ")[0];
                          const subLabel = name.match(/\(([^)]+)\)/)?.[1] || "";
                          const isSelected = insulinType === name;
                          return (
                            <button
                              key={name}
                              onClick={() => setInsulinType(name)}
                              className="flex flex-col items-start px-3 py-2 rounded-xl border transition-all text-left text-white"
                              style={{
                                minWidth: "72px",
                                borderColor: isSelected ? p.color + "aa" : "rgba(255,255,255,0.1)",
                                backgroundColor: isSelected ? p.color + "22" : "rgba(255,255,255,0.05)",
                              }}>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                <span className="text-sm font-semibold">{shortLabel}</span>
                              </div>
                              {subLabel && <span className="text-xs text-white/40 mt-0.5 ml-3.5">{subLabel}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pharmacokinetics */}
              {profile && (
                <div className="border border-white/10 rounded-2xl px-4 py-3 grid grid-cols-3 divide-x divide-white/10"
                  style={{ backgroundColor: accentColor + "11" }}>
                  <div className="text-center pr-4">
                    <p className="font-bold text-base" style={{ color: accentColor }}>
                      {profile.onsetMin < 60 ? `${profile.onsetMin}m` : `${Math.round(profile.onsetMin / 60)}h`}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Onset</p>
                  </div>
                  <div className="text-center px-4">
                    <p className="font-bold text-base" style={{ color: accentColor }}>
                      {profile.peakMin
                        ? `${Math.round(profile.peakMin / 60)}h${profile.peakMin % 60 ? ` ${profile.peakMin % 60}m` : ""}`
                        : "—"}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Peak</p>
                  </div>
                  <div className="text-center pl-4">
                    <p className="font-bold text-base" style={{ color: accentColor }}>{Math.round(profile.durationMin / 60)}h</p>
                    <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Duration</p>
                  </div>
                </div>
              )}

              {/* Units */}
              <div>
                <p className="text-xs font-bold tracking-widests text-white/40 uppercase mb-3">Units</p>
                <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between mb-3">
                  <button onClick={() => adjust(-1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">−</button>
                  <div className="text-center">
                    <span className="text-4xl font-bold text-white">{units}</span>
                    <p className="text-white/40 text-xs mt-1">units</p>
                  </div>
                  <button onClick={() => adjust(1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">+</button>
                </div>
                <div className="flex gap-2">
                  {[5, 10, 15, 20, 25].map((v) => (
                    <button key={v} onClick={() => setUnits(v)}
                      className="flex-1 py-2 rounded-xl text-sm font-medium transition-all border text-white"
                      style={{ borderColor: units === v ? accentColor + "99" : "rgba(255,255,255,0.1)", backgroundColor: units === v ? accentColor + "2a" : "rgba(255,255,255,0.05)" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">Notes (Optional)</p>
                <Textarea value={insulinNotes} onChange={(e) => setInsulinNotes(e.target.value)}
                  placeholder="e.g. before lunch, correction dose..." rows={2}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl resize-none" />
              </div>
            </div>

            <div className="px-5 pb-6 pt-2 shrink-0">
              <button onClick={handleSubmitInsulin} disabled={!insulinType || !units || createDose.isPending}
                className="w-full py-4 rounded-2xl disabled:opacity-40 text-white font-semibold text-base transition-all"
                style={{ backgroundColor: accentColor, filter: "brightness(0.85)" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(0.85)"; }}>
                {createDose.isPending ? "Logging..." : insulinType ? `Log ${units}u ${shortName} Now` : "Select an insulin type"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Glucose body */}
            <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-6">
              <div>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">Blood Glucose (mg/dL)</p>
                <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-6 flex items-center justify-between mb-4">
                  <button onClick={() => adjustGlucose(-5)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">−</button>
                  <div className="text-center">
                    <span className="text-5xl font-bold" style={{ color: glucoseValue < 70 ? "#ef4444" : glucoseValue > 180 ? "#f97316" : "#4ade80" }}>{glucoseValue}</span>
                    <p className="text-white/40 text-xs mt-1">mg/dL</p>
                    <p className="text-xs mt-1 font-medium" style={{ color: glucoseValue < 70 ? "#ef4444" : glucoseValue > 180 ? "#f97316" : "#4ade80" }}>
                      {glucoseValue < 70 ? "Low" : glucoseValue > 180 ? "High" : "In Range"}
                    </p>
                  </div>
                  <button onClick={() => adjustGlucose(5)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">+</button>
                </div>

                {/* Slider */}
                <input type="range" min={40} max={400} step={1} value={glucoseValue}
                  onChange={(e) => setGlucoseValue(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: glucoseColor }} />
                <div className="flex justify-between text-[10px] text-white/30 mt-1 px-1">
                  <span>40</span><span>120</span><span>180</span><span>250</span><span>400</span>
                </div>

                {/* Presets */}
                <div className="flex gap-2 flex-wrap mt-4">
                  {GLUCOSE_PRESETS.map((v) => (
                    <button key={v} onClick={() => setGlucoseValue(v)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border text-white transition-all"
                      style={{ borderColor: glucoseValue === v ? glucoseColor + "aa" : "rgba(255,255,255,0.1)", backgroundColor: glucoseValue === v ? glucoseColor + "22" : "rgba(255,255,255,0.05)" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time */}
              <div>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">Time</p>
                <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-white/40">Reading time</span>
                  <input
                    type="time"
                    value={glucoseTime}
                    onChange={(e) => setGlucoseTime(e.target.value)}
                    className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">Notes (Optional)</p>
                <Textarea value={glucoseNotes} onChange={(e) => setGlucoseNotes(e.target.value)}
                  placeholder="e.g. fasting, after meal..." rows={2}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl resize-none" />
              </div>
            </div>

            <div className="px-5 pb-6 pt-2 shrink-0">
              <button onClick={handleSubmitGlucose} disabled={!glucoseValue || createGlucose.isPending}
                className="w-full py-4 rounded-2xl disabled:opacity-40 text-white font-semibold text-base transition-all"
                style={{ backgroundColor: glucoseColor, filter: "brightness(0.85)" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(0.85)"; }}>
                {createGlucose.isPending ? "Logging..." : `Log ${glucoseValue} mg/dL`}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}