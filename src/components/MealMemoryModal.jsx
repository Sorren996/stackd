import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, ArrowRight, Clock, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { buildMealMemorySummary, buildAggregateSummary } from "@/lib/mealMemorySummary";
import { submitMatchFeedback, confoundingLabels, OUTCOME_LABELS } from "@/lib/mealMemory";

const TREND_ICON = { rising: TrendingUp, falling: TrendingDown, steady: Minus, unknown: Minus };

function formatUnits(units) {
  if (!Number.isFinite(units) || units <= 0) return "0u";
  return units % 1 === 0 ? `${units}u` : `${units.toFixed(1)}u`;
}

function ResponseSparkline({ analysis }) {
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!analysis?.meal_time) return;
    let cancelled = false;
    setLoading(true);
    const start = new Date(analysis.meal_time).getTime() - 30 * 60 * 1000;
    const end = new Date(analysis.analysis_window_end).getTime();
    base44.entities.GlucoseReading.filter(
      { recorded_at: { $gte: new Date(start).toISOString(), $lte: new Date(end).toISOString() } },
      "recorded_at",
      500
    )
      .then((rows) => {
        if (cancelled) return;
        setPoints(rows.map((r) => [new Date(r.recorded_at).getTime(), Number(r.value)]).filter(([, v]) => Number.isFinite(v)));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [analysis]);

  if (loading) return <div className="h-16 w-full animate-pulse rounded-xl bg-white/5" />;
  if (!points || points.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center rounded-xl border border-white/8 bg-white/[0.02] text-[11px] text-white/35">
        Not enough glucose data for a graph
      </div>
    );
  }

  const width = 320;
  const height = 64;
  const values = points.map(([, v]) => v);
  const min = Math.min(...values, analysis.target_range_low);
  const max = Math.max(...values, analysis.target_range_high);
  const range = max - min || 1;
  const lowY = height - ((analysis.target_range_low - min) / range) * height;
  const highY = height - ((analysis.target_range_high - min) / range) * height;
  const path = points
    .map(([t, v], i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none">
      <rect x="0" y={highY} width={width} height={Math.max(0, lowY - highY)} fill="rgba(217,169,56,0.08)" />
      <path d={path} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
      <span className="text-right text-xs font-medium text-white/85">{value}</span>
    </div>
  );
}

export default function MealMemoryModal({ open, match, currentMeal, onContinue, onClose }) {
  const [showDetails, setShowDetails] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (open) {
      setShowDetails(false);
      setFeedbackSent(false);
    }
  }, [open]);

  if (!open || !match) return null;

  const analysis = match.analysis;
  const summary = buildMealMemorySummary(currentMeal, match);
  const aggregate = match?.aggregate ? buildAggregateSummary(match.aggregate.count, match.aggregate.matches) : null;
  const TrendIcon = TREND_ICON[analysis.starting_trend] || Minus;
  const confounders = confoundingLabels(analysis.confounding_events);
  const outcomeLabel = OUTCOME_LABELS[analysis.outcome_classification] || "Outcome unclear";

  const handleNotSame = async () => {
    await submitMatchFeedback({ match, currentMeal, feedbackType: "not_same_meal" });
    setFeedbackSent(true);
    onClose?.();
  };

  const peakDelay = analysis.peak_time && analysis.meal_time
    ? Math.round((new Date(analysis.peak_time).getTime() - new Date(analysis.meal_time).getTime()) / 60000)
    : null;
  const peakDelayLabel = peakDelay != null
    ? (peakDelay >= 60 ? `about ${Math.round(peakDelay / 60)}h after` : `${peakDelay}m after`)
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-black/70 px-3 pb-6 pt-6 backdrop-blur-sm sm:items-center sm:px-4"
      >
        <motion.div
          initial={{ y: 40, scale: 0.98, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 20, scale: 0.98, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="meal-memory-modal w-full max-w-md overflow-y-auto rounded-3xl border p-5"
          style={{
            background: "linear-gradient(165deg, rgba(18,28,23,0.96), rgba(10,16,13,0.97))",
            borderColor: "rgba(255,255,255,0.14)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.1)",
          }}
        >
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-teal-400/25 bg-teal-400/10">
                <Sparkles className="h-4 w-4 text-teal-300" />
              </div>
              <h2 className="text-base font-semibold text-white">You've had something similar before</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border text-white/60 transition hover:text-white"
              style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", borderColor: "rgba(255,255,255,0.12)" }}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {aggregate && (
            <div className="mb-3 rounded-xl border border-teal-400/15 bg-teal-400/[0.05] px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-teal-100/85">{aggregate}</p>
            </div>
          )}

          <p className="text-[13px] leading-relaxed text-white/80">{summary.body}</p>

          {summary.reminder && (
            <p className="mt-2.5 text-[11px] italic leading-relaxed text-white/45">{summary.reminder}</p>
          )}

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-white/45" />
                    <p className="text-xs font-semibold text-white/70">
                      {analysis.meal_name_original} · {analysis.meal_time ? format(new Date(analysis.meal_time), "EEE, MMM d · h:mm a") : "Past meal"}
                    </p>
                  </div>

                  <ResponseSparkline analysis={analysis} />

                  <div className="mt-3 divide-y divide-white/5">
                    <DetailRow label="Carbs logged" value={`${Math.round(analysis.carbs_logged)}g`} />
                    <DetailRow
                      label="Starting glucose"
                      value={
                        Number.isFinite(analysis.starting_glucose)
                          ? `${Math.round(analysis.starting_glucose)} mg/dL · ${analysis.starting_trend || "steady"}`
                          : "Not available"
                      }
                    />
                    <DetailRow
                      label="Peak glucose"
                      value={
                        Number.isFinite(analysis.peak_glucose)
                          ? `${Math.round(analysis.peak_glucose)} mg/dL${peakDelayLabel ? ` · ${peakDelayLabel}` : ""}`
                          : "Not available"
                      }
                    />
                    <DetailRow
                      label="Lowest glucose"
                      value={Number.isFinite(analysis.lowest_glucose) ? `${Math.round(analysis.lowest_glucose)} mg/dL` : "Not available"}
                    />
                    <DetailRow
                      label="Glucose at 4h"
                      value={Number.isFinite(analysis.glucose_at_4_hours) ? `${Math.round(analysis.glucose_at_4_hours)} mg/dL` : "Not available"}
                    />
                    <DetailRow label="Time in range" value={`${analysis.time_in_user_range ?? 0}%`} />
                    <DetailRow
                      label="Initial insulin"
                      value={analysis.initial_insulin_units > 0 ? `${formatUnits(analysis.initial_insulin_units)} · ${analysis.initial_insulin_type || ""}` : "None logged"}
                    />
                    <DetailRow
                      label="Additional insulin"
                      value={analysis.additional_insulin_units > 0 ? `${formatUnits(analysis.additional_insulin_units)}` : "None"}
                    />
                    <DetailRow label="Total insulin" value={formatUnits(analysis.total_insulin_units)} />
                    <DetailRow label="Rescue carbs" value={analysis.rescue_carbs > 0 ? `${Math.round(analysis.rescue_carbs)}g` : "None"} />
                    <DetailRow label="Outcome" value={outcomeLabel} />
                  </div>

                  {confounders.length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">Context that affected this response</p>
                      <ul className="mt-1 space-y-0.5">
                        {confounders.map((c) => (
                          <li key={c} className="flex items-center gap-1.5 text-[11px] text-amber-100/70">
                            <Activity className="h-3 w-3 shrink-0" /> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition"
              style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.9), rgba(91,163,184,0.78))", boxShadow: "0 8px 24px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)" }}
            >
              Continue logging
            </button>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-semibold text-white/80 transition hover:bg-white/5"
              style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}
            >
              {showDetails ? "Hide past response" : "View past response"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNotSame}
              disabled={feedbackSent}
              className="w-full py-2 text-[11px] font-medium text-white/40 transition hover:text-white/70"
            >
              {feedbackSent ? "Thanks — we'll remember that" : "Not the same meal"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}