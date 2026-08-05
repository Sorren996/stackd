import { useState } from "react";
import { motion } from "framer-motion";
import { X, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

const CAUSE_OPTIONS = [
  { value: "meal", label: "Meal", emoji: "🍽️", description: "Food-related rise" },
  { value: "stress", label: "Stress", emoji: "💨", description: "A demanding moment" },
  { value: "dawn_effect", label: "Dawn Effect", emoji: "🌅", description: "Early morning rise" },
  { value: "workout", label: "Workout", emoji: "💪", description: "Exercise-related" },
  { value: "other", label: "Something Else", emoji: "🤔", description: "Another factor" },
];

export default function SpikeTagModal({ spike, onClose }) {
  const [selectedCause, setSelectedCause] = useState(spike.taggedCause || null);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (!selectedCause) return;
    setIsSaving(true);
    try {
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
  const peakTime = new Date(spike.peakTime);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl border p-5 sm:rounded-3xl"
        style={{
          background: "linear-gradient(165deg, hsl(162,12%,9%), hsl(162,10%,6%))",
          borderColor: "rgba(255,255,255,0.14)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 70%)" }}
            >
              <TrendingUp className="h-4 w-4 text-amber-300/80" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">A Glucose Rise</h3>
              <p className="text-[11px] text-white/45">What do you think sparked this?</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border text-white/60"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Spike summary */}
        <div className="mb-4 rounded-2xl border p-3" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between text-xs">
            <div>
              <p className="text-white/40">Started</p>
              <p className="font-semibold text-white">{format(startTime, "h:mm a")}</p>
              <p className="text-[10px] text-white/35">{format(startTime, "MMM d")}</p>
            </div>
            <div className="text-center">
              <p className="text-white/40">Rise</p>
              <p className="text-lg font-black text-amber-300">+{spike.riseAmount}</p>
              <p className="text-[10px] text-white/35">mg/dL</p>
            </div>
            <div className="text-right">
              <p className="text-white/40">Peak</p>
              <p className="font-semibold text-white">{spike.peakGlucose}</p>
              <p className="text-[10px] text-white/35">mg/dL</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-white/35">
            <span>{spike.startGlucose} → {spike.peakGlucose} mg/dL</span>
            <span>·</span>
            <span>over ~{spike.durationMinutes} min</span>
          </div>
        </div>

        {/* Cause options */}
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">What was happening?</p>
        <div className="grid grid-cols-1 gap-2">
          {CAUSE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedCause(option.value)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                selectedCause === option.value ? "text-white" : "text-white/55 hover:text-white/75"
              }`}
              style={
                selectedCause === option.value
                  ? {
                      background: "linear-gradient(145deg, rgba(251,191,36,0.12), rgba(91,168,138,0.06))",
                      borderColor: "rgba(251,191,36,0.3)",
                    }
                  : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }
              }
            >
              <span className="text-lg">{option.emoji}</span>
              <div>
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-[10px] text-white/35">{option.description}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!selectedCause || isSaving}
          className="mt-4 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
          style={{
            background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
            boxShadow: "0 6px 20px rgba(91,163,184,0.2), inset 0 1px 1px rgba(255,255,255,0.2)",
          }}
        >
          {isSaving ? "Saving..." : "Save reflection"}
        </button>
      </motion.div>
    </motion.div>
  );
}