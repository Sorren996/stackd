import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { X, Syringe, Droplets } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Slider } from "@/components/ui/slider";

const CATEGORY_ORDER = ["Rapid-Acting", "Short-Acting", "Intermediate", "Long-Acting", "Ultra Long-Acting"];

const groupedInsulins = CATEGORY_ORDER.reduce((acc, cat) => {
  const items = Object.entries(INSULIN_PROFILES).filter(([, p]) => p.category === cat);
  if (items.length) acc.push({ category: cat, items });
  return acc;
}, []);

const GLUCOSE_PRESETS = [70, 100, 120, 140, 180, 200, 250];

export default function DoseForm({ open, onOpenChange }) {
  const [tab, setTab] = useState("insulin");
  const [insulinType, setInsulinType] = useState("");
  const [units, setUnits] = useState(10);
  const [insulinNotes, setInsulinNotes] = useState("");
  const [insulinTime, setInsulinTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [glucoseValue, setGlucoseValue] = useState(100);
  const [glucoseNotes, setGlucoseNotes] = useState("");
  const [glucoseTime, setGlucoseTime] = useState(() => new Date().toTimeString().slice(0, 5));

  const nowTimeString = new Date().toTimeString().slice(0, 5);
  const queryClient = useQueryClient();

  const createDose = useMutation({
    mutationFn: (data) => base44.entities.InsulinDose.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose logged — tracking activity now");
      onOpenChange(false);
      setInsulinType(""); setUnits(10); setInsulinNotes("");
      setInsulinTime(new Date().toTimeString().slice(0, 5));
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
  const infoColor = profile ? accentColor : "rgba(255,255,255,0.3)";
const infoBg = profile ? accentColor + "11" : "rgba(255,255,255,0.02)";
const infoBorder = profile ? accentColor + "22" : "rgba(255,255,255,0.05)";
  const glucoseColor = "#c2611cff";

  const handleSubmitInsulin = () => {
    if (!insulinType || !units) return;
    const [h, m] = insulinTime.split(":").map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    createDose.mutate({
      insulin_type: insulinType,
      units: parseFloat(units),
      administered_at: dt.toISOString(),
      notes: insulinNotes || undefined
    });
  };

  const handleSubmitGlucose = () => {
    if (!glucoseValue) return;
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
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogPortal forceMount>
            {/* Animated Backdrop */}
            <DialogOverlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
                onClick={() => onOpenChange(false)}
              />
            </DialogOverlay>

            {/* Animated Sheet / Modal */}
            <DialogPrimitive.Content asChild forceMount>

            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 280, damping: 28 }
              }}
              exit={{
                opacity: 0,
                y: "100%",
                transition: { duration: 0.22, ease: "easeInOut" }
              }}
              className="fixed bottom-0 sm:bottom-auto left-0 right-0 sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-full sm:max-w-md flex flex-col overflow-hidden rounded-t-[2rem] sm:rounded-3xl"
              style={{ background: "hsl(162,10%,8%)", maxHeight: "92vh" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between relative px-6 pt-5 pb-3 shrink-0">
                <div className="w-8" />
                <span className="text-white text-lg font-semibold">Log Entry</span>
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white active:scale-95 transition"
                >
                  <X className="w-4 h-4" />
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
                  <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-6">
                    {/* Insulin Type */}
                    <div>
                      <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Insulin Type</p>
                      <div className="space-y-3">
                        {groupedInsulins.map(({ category, items }) => (
                          <div key={category}>
                            <p className="text-sm text-white/40 mb-2">{category}</p>
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
                                    {subLabel && <span className="text-sm text-white/40 mt-0.5 ml-3.5">{subLabel}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pharmacokinetics */}
<div 
  className="border rounded-2xl px-4 py-3 grid grid-cols-3 divide-x divide-white/10 transition-all duration-300"
  style={{ backgroundColor: infoBg, borderColor: infoBorder }}
>
  <div className="text-center pr-4">
    <p className="font-bold text-base transition-colors" style={{ color: infoColor }}>
      {profile 
        ? (profile.onsetMin < 60 ? `${profile.onsetMin}m` : `${Math.round(profile.onsetMin / 60)}h`) 
        : "—"
      }
    </p>
    <p className="text-white/40 text-sm mt-0.5 uppercase tracking-wider">Onset</p>
  </div>
  <div className="text-center px-4">
    <p className="font-bold text-base transition-colors" style={{ color: infoColor }}>
      {profile 
        ? (profile.peakMin 
            ? `${Math.round(profile.peakMin / 60)}h${profile.peakMin % 60 ? ` ${profile.peakMin % 60}m` : ""}` 
            : "—") 
        : "—"
      }
    </p>
    <p className="text-white/40 text-sm mt-0.5 uppercase tracking-wider">Peak</p>
  </div>
  <div className="text-center pl-4">
    <p className="font-bold text-base transition-colors" style={{ color: infoColor }}>
      {profile ? `${Math.round(profile.durationMin / 60)}h` : "—"}
    </p>
    <p className="text-white/40 text-sm mt-0.5 uppercase tracking-wider">Duration</p>
  </div>
</div>

                    {/* Units */}
                    <div>
                      <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Units</p>
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between mb-3">
                        <button onClick={() => adjust(-1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">−</button>
                        <div className="text-center">
                          <span className="text-4xl font-bold text-white">{units}</span>
                          <p className="text-white/40 text-sm mt-1">units</p>
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

                    {/* Time */}
                    <div>
                      <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Time Administered</p>
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                        <span className="text-sm text-white/40">Administered at</span>
                        <input
                          type="time"
                          value={insulinTime}
                          max={nowTimeString}
                          onChange={(e) => { if (e.target.value <= nowTimeString) setInsulinTime(e.target.value); }}
                          className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Notes (Optional)</p>
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
                  <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-6">
                    <div>
                      <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Blood Glucose (mg/dL)</p>
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-6 flex items-center justify-between mb-4">
                        <button onClick={() => adjustGlucose(-1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">−</button>
                        <div className="text-center">
                          <span className="text-5xl font-bold" style={{ color: glucoseValue < 70 ? "#e9e9e9ff" : glucoseValue > 180 ? "#e9e9e9ff" : "#e9e9e9ff" }}>{glucoseValue}</span>
                          <p className="text-white/40 text-sm mt-1">mg/dL</p>
                          <p className="text-sm mt-1 font-medium" style={{ color: glucoseValue < 70 ? "#e9e9e9ff" : glucoseValue > 180 ? "#f97e9e9e9ff316" : "#e9e9e9ff" }}>
                    
                          </p>
                        </div>
                        <button onClick={() => adjustGlucose(1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">+</button>
                      </div>

  <Slider
  min={40}
  max={400}
  step={1}
  value={[glucoseValue]}
  onValueChange={([v]) => setGlucoseValue(v)}
  className="my-4 cursor-pointer"
/>

                     
                    
                    </div>

                    {/* Time */}
                    <div>
                      <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Time</p>
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                        <span className="text-sm text-white/40">Reading time</span>
                        <input
                          type="time"
                          value={glucoseTime}
                          max={nowTimeString}
                          onChange={(e) => { if (e.target.value <= nowTimeString) setGlucoseTime(e.target.value); }}
                          className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Notes (Optional)</p>
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
            </motion.div>
            </DialogPrimitive.Content>

          </DialogPortal>
        </Dialog>
      )}
    </AnimatePresence>
  );
}