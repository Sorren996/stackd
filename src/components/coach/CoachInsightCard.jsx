import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, MessageCircle, Eye, X, BookOpen, ChevronDown } from "lucide-react";

const TYPE_LABELS = {
  meal_pattern: "Meal Pattern",
  time_of_day_pattern: "Time of Day",
  glucose_rhythm: "Glucose Rhythm",
  journal_reflection: "Journal Reflection",
  logging_pattern: "Logging Pattern",
  positive_consistency: "Consistency",
  weekly_reflection: "Weekly Reflection",
};

export default function CoachInsightCard({ insight, onTalkAbout, onDismiss, onSaveToJournal }) {
  const [showSupporting, setShowSupporting] = useState(false);

  const glucoseCount = insight.supporting_glucose_log_ids?.length || 0;
  const carbCount = insight.supporting_carb_log_ids?.length || 0;
  const insulinCount = insight.supporting_insulin_log_ids?.length || 0;
  const journalCount = insight.supporting_journal_entry_ids?.length || 0;
  const totalSupporting = glucoseCount + carbCount + insulinCount + journalCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border p-4"
      style={{
        background: "linear-gradient(145deg, rgba(251,191,36,0.06), rgba(91,168,138,0.04))",
        borderColor: "rgba(251,191,36,0.2)",
        boxShadow: "0 4px 20px rgba(251,191,36,0.06), inset 0 1px 1px rgba(255,255,255,0.08)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 70%)" }}
          >
            <Leaf className="h-3.5 w-3.5 text-amber-300/90" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">
            {TYPE_LABELS[insight.insight_type] || "Insight"}
          </span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(insight)}
            aria-label="Dismiss insight"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/35 transition hover:text-white/70"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-sm font-semibold text-white">{insight.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-white/70">{insight.summary}</p>

      {totalSupporting > 0 && (
        <button
          type="button"
          onClick={() => setShowSupporting((v) => !v)}
          className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-white/40 transition hover:text-white/60"
        >
          <Eye className="h-3 w-3" />
          Why am I seeing this?
          <ChevronDown className={`h-3 w-3 transition-transform ${showSupporting ? "rotate-180" : ""}`} />
        </button>
      )}

      <AnimatePresence>
        {showSupporting && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 rounded-xl border border-white/8 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Supporting records
              </p>
              <div className="flex flex-wrap gap-2">
                {glucoseCount > 0 && (
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/55">
                    {glucoseCount} glucose {glucoseCount === 1 ? "reading" : "readings"}
                  </span>
                )}
                {carbCount > 0 && (
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/55">
                    {carbCount} meal {carbCount === 1 ? "log" : "logs"}
                  </span>
                )}
                {insulinCount > 0 && (
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/55">
                    {insulinCount} insulin {insulinCount === 1 ? "log" : "logs"}
                  </span>
                )}
                {journalCount > 0 && (
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/55">
                    {journalCount} journal {journalCount === 1 ? "entry" : "entries"}
                  </span>
                )}
              </div>
              {insight.observation_start_at && insight.observation_end_at && (
                <p className="text-[10px] text-white/35">
                  Reviewed {new Date(insight.observation_start_at).toLocaleDateString()} –{" "}
                  {new Date(insight.observation_end_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 flex flex-wrap gap-2">
        {onTalkAbout && (
          <button
            type="button"
            onClick={() => onTalkAbout(insight)}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium text-white transition hover:bg-white/5"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.18), rgba(91,163,184,0.1))",
              borderColor: "rgba(91,168,138,0.25)",
            }}
          >
            <MessageCircle className="h-3.5 w-3.5 text-teal-300/80" />
            Talk about this
          </button>
        )}
        {onSaveToJournal && (
          <button
            type="button"
            onClick={() => onSaveToJournal(insight)}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/55 transition hover:text-white/80"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Save to journal
          </button>
        )}
      </div>
    </motion.div>
  );
}