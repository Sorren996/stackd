import { useState } from "react";
import { motion } from "framer-motion";
import { X, TrendingUp, Utensils, Wind, Sunrise, Activity, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

const CAUSE_OPTIONS = [
  { value: "meal", label: "A Meal", Icon: Utensils, color: "#5ba88a", description: "Nourishment moved through" },
  { value: "stress", label: "A Stressful Moment", Icon: Wind, color: "#6b92c4", description: "A demanding wave" },
  { value: "dawn_effect", label: "Morning Dawn", Icon: Sunrise, color: "#fbbf24", description: "Your body's natural waking rhythm" },
  { value: "workout", label: "Movement", Icon: Activity, color: "#34d399", description: "Activity that shifted things" },
  { value: "other", label: "Something Else", Icon: Sparkles, color: "#a78bfa", description: "Another gentle factor" },
];

export default function SpikeTagModal({ spike, onClose }) {
  const [selectedCause, setSelectedCause] = useState(spike.taggedCause || null);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (!selectedCause) return;
    setIsSaving(true);
    try {
      if (spike.eventId) {
        await base44.entities.GlucoseEvent.update(spike.eventId, {
          user_tagged_cause: selectedCause,
          user_tagged_at: new Date().toISOString(),
        });
      } else {
        await base44.entities.GlucoseEvent.create({
          event_type: "spike",
          start_time: spike.startTime,
          end_time: spike.peakTime,
          starting_glucose: spike.startGlucose,
          peak_glucose: spike.peakGlucose,
          peak_time: spike.peakTime,
          duration_minutes: spike.durationMinutes,
          rate_of_rise: spike.rateOfRise,
          user_tagged_cause: selectedCause,
          user_tagged_at: new Date().toISOString(),
          classification: "user_tagged",
          confidence: 1,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["spike-events"] });
      toast.success("Thank you for reflecting on that moment.");
      onClose();
    } catch {
      toast.error("Could not save right now — please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const startTime = new Date(spike.startTime);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] border sm:rounded-[2rem]"
        style={{
          background: "linear-gradient(165deg, hsl(162,12%,10%), hsl(162,10%,5%))",
          borderColor: "rgba(255,255,255,0.14)",
          boxShadow:
            "0 -24px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 1px rgba(255,255,255,0.14), inset 0 -1px 1px rgba(255,255,255,0.03)",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Header — fixed */}
        <div
          className="shrink-0 px-6 pb-5 pt-6"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, rgba(251,191,36,0.04), transparent)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl border"
                style={{
                  background: "radial-gradient(circle, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.04) 70%, transparent 100%)",
                  borderColor: "rgba(251,191,36,0.22)",
                }}
              >
                <TrendingUp className="h-5 w-5 text-amber-300/85" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold tracking-tight text-white">A Gentle Rise</h3>
                <p className="mt-0.5 text-[11px] text-white/40">What do you think stirred this moment?</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border text-white/50 transition hover:text-white/80"
              style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "none" }}>
          {/* Spike summary */}
          <div
            className="rounded-2xl border p-4"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
              borderColor: "rgba(255,255,255,0.1)",
              boxShadow: "inset 0 1px 1px rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Started</p>
                <p className="mt-1 text-sm font-bold text-white">{format(startTime, "h:mm a")}</p>
                <p className="mt-0.5 text-[10px] text-white/35">{format(startTime, "EEE, MMM d")}</p>
              </div>

              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[11px] font-medium text-white/35">{spike.startGlucose}</span>
                <span className="text-[10px] text-amber-300/60">→</span>
              </div>

              <div className="flex flex-col items-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-300/50">Rose</p>
                <p className="mt-1 text-xl font-black text-amber-300">+{spike.riseAmount}</p>
                <p className="mt-0.5 text-[10px] text-white/35">mg/dL</p>
              </div>

              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[10px] text-amber-300/60">→</span>
                <span className="text-[11px] font-medium text-white/35">{spike.peakGlucose}</span>
              </div>

              <div className="flex flex-col items-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Peak</p>
                <p className="mt-1 text-sm font-bold text-white">{spike.peakGlucose}</p>
                <p className="mt-0.5 text-[10px] text-white/35">mg/dL</p>
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] text-white/30">
              Over ~{spike.durationMinutes} minutes
            </p>
          </div>

          {/* Cause options */}
          <p className="mb-3 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            What was unfolding?
          </p>
          <div className="grid grid-cols-1 gap-2.5">
            {CAUSE_OPTIONS.map((option) => {
              const isSelected = selectedCause === option.value;
              const { Icon, color } = option;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedCause(option.value)}
                  className="flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition"
                  style={
                    isSelected
                      ? {
                          background: `linear-gradient(145deg, ${color}1a, ${color}08)`,
                          borderColor: `${color}52`,
                          boxShadow: `inset 0 1px 1px rgba(255,255,255,0.08), 0 0 14px ${color}14`,
                        }
                      : {
                          background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                          borderColor: "rgba(255,255,255,0.08)",
                        }
                  }
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                    style={{
                      background: isSelected
                        ? `radial-gradient(circle, ${color}22, transparent 70%)`
                        : "rgba(255,255,255,0.03)",
                      borderColor: isSelected ? `${color}3a` : "rgba(255,255,255,0.06)",
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: isSelected ? color : "rgba(255,255,255,0.4)" }}
                      strokeWidth={2}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[13px] font-semibold"
                      style={{ color: isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)" }}
                    >
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/35">{option.description}</p>
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: `${color}66`,
                        border: `1px solid ${color}80`,
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer — fixed */}
        <div
          className="shrink-0 px-6 pb-6 pt-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedCause || isSaving}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition disabled:opacity-30"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.82), rgba(91,163,184,0.68))",
              boxShadow:
                "0 8px 24px rgba(91,163,184,0.18), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.04)",
            }}
          >
            {isSaving ? "Saving your reflection…" : "Save this reflection"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}