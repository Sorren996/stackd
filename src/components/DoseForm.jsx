import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_ORDER = ["Rapid-Acting", "Short-Acting", "Intermediate", "Long-Acting", "Ultra Long-Acting"];

const groupedInsulins = CATEGORY_ORDER.reduce((acc, cat) => {
  const items = Object.entries(INSULIN_PROFILES).filter(([, p]) => p.category === cat);
  if (items.length) acc.push({ category: cat, items });
  return acc;
}, []);

export default function DoseForm({ open, onOpenChange }) {
  const [insulinType, setInsulinType] = useState("");
  const [units, setUnits] = useState(10);
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const createDose = useMutation({
    mutationFn: (data) => base44.entities.InsulinDose.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose logged — tracking activity now");
      onOpenChange(false);
      setInsulinType("");
      setUnits(10);
      setNotes("");
    }
  });

  const profile = insulinType ? INSULIN_PROFILES[insulinType] : null;

  const handleSubmit = () => {
    if (!insulinType || !units) return;
    createDose.mutate({
      insulin_type: insulinType,
      units: parseFloat(units),
      administered_at: new Date().toISOString(),
      notes: notes || undefined
    });
  };

  const adjust = (delta) => setUnits((u) => Math.max(0.5, Math.round((u + delta) * 2) / 2));

  const shortName = insulinType ? insulinType.split(" ")[0] : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-md w-full sm:rounded-3xl overflow-hidden border-0"
        style={{ background: 'hsl(162,10%,8%)', maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="flex items-center justify-center relative px-6 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-white text-lg font-semibold">Log Dose</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute left-5 top-5 text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
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
                          className={`flex flex-col items-start px-3 py-2 rounded-xl border transition-all text-left ${
                            isSelected
                              ? "border-teal-500/70 bg-teal-600/20 text-white"
                              : "border-white/10 bg-white/5 text-white/70 hover:border-white/30"
                          }`}
                          style={{ minWidth: "72px" }}>
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
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 grid grid-cols-3 divide-x divide-white/10">
              <div className="text-center pr-4">
                <p className="text-teal-400 font-bold text-base">
                  {profile.onsetMin < 60 ? `${profile.onsetMin}m` : `${Math.round(profile.onsetMin / 60)}h`}
                </p>
                <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Onset</p>
              </div>
              <div className="text-center px-4">
                <p className="text-teal-400 font-bold text-base">
                  {profile.peakMin
                    ? `${Math.round(profile.peakMin / 60)}h ${profile.peakMin % 60 ? `${profile.peakMin % 60}m` : ""}`
                    : "—"}
                </p>
                <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Peak</p>
              </div>
              <div className="text-center pl-4">
                <p className="text-teal-400 font-bold text-base">{Math.round(profile.durationMin / 60)}h</p>
                <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Duration</p>
              </div>
            </div>
          )}

          {/* Units */}
          <div>
            <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">Units</p>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between mb-3">
              <button
                onClick={() => adjust(-1)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">
                −
              </button>
              <div className="text-center">
                <span className="text-4xl font-bold text-white">{units}</span>
                <p className="text-white/40 text-xs mt-1">units</p>
              </div>
              <button
                onClick={() => adjust(1)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">
                +
              </button>
            </div>
            <div className="flex gap-2">
              {[5, 10, 15, 20, 25].map((v) => (
                <button
                  key={v}
                  onClick={() => setUnits(v)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                    units === v
                      ? "bg-teal-600/30 border-teal-500/70 text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/30"
                  }`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">Notes (Optional)</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. before lunch, correction dose..."
              rows={2}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl resize-none focus:border-teal-500" />
          </div>
        </div>

        {/* Submit */}
        <div className="px-5 pb-6 pt-2 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!insulinType || !units || createDose.isPending}
            className="w-full py-4 rounded-2xl bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white font-semibold text-base transition-all">
            {createDose.isPending
              ? "Logging..."
              : insulinType
              ? `Log ${units}u ${shortName} Now`
              : "Select an insulin type"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}