import { motion } from "framer-motion";
import { AlertTriangle, Check, Clock, Info, Loader2, Sprout } from "lucide-react";
import { formatMonitoringEndTime } from "@/lib/mealMonitoring";

const MINUTE_MS = 60 * 1000;

const REVIEW_BLUE = "#5f8cf5";

function formatRemaining(ms) {
  if (ms <= 0) return null;
  const totalMin = Math.floor(ms / MINUTE_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Derive a meaningful, data-grounded completed outcome from values the
 * existing Meal Balance logic already computed (start, end, peak, low).
 * This is presentation-layer interpretation only — no new calculations.
 */
function getCompletedOutcome(d) {
  const start = d.glucoseValue;
  const end = d.windowEndGlucoseValue;
  const peak = d.peakOutcome;
  const low = d.lowOutcome;
  const hasPeak = typeof peak === "number";
  const hasLow = typeof low === "number";

  if (start == null || end == null) {
    return { label: "Glucose response reviewed", color: "#5ba88a" };
  }

  const diff = end - start;
  const absDiff = Math.abs(diff);
  const rose = hasPeak && peak > start + 30;
  const dipped = hasLow && low < start - 30;

  if (absDiff <= 15) {
    if (rose) return { label: "A brief rise, then settled near start", color: "#5ba88a" };
    if (dipped) return { label: "A brief dip, then settled near start", color: "#5ba88a" };
    return { label: "Glucose settled near where it started", color: "#5ba88a" };
  }
  if (diff > 15) {
    return { label: "Finished above the meal starting level", color: "#d4a056" };
  }
  return { label: "Finished below the meal starting level", color: "#6b92c4" };
}

function StateIcon({ state, color }) {
  if (state === "reviewing") {
    return <Loader2 className="h-4 w-4 animate-spin" style={{ color, animationDuration: "2.8s" }} strokeWidth={2.5} />;
  }
  if (state === "complete") {
    return <Check className="h-4 w-4" style={{ color }} strokeWidth={2.5} />;
  }
  return <Sprout className="h-4 w-4" style={{ color }} strokeWidth={2} />;
}

export default function MealBalanceCard({ mealInsight, highProteinFatStatus, onOpenTooltip }) {
  const d = mealInsight?.details;
  const hasMeal = Boolean(d);

  let state = "none";
  if (hasMeal) {
    state = d.mealStillUnderReview ? "reviewing" : "complete";
  }

  const carbs = hasMeal ? Math.round(d.meal?.carbs || 0) : 0;

  let headline = "No meal being reviewed";
  let body = "Log nourishment to start a meal window";
  let outcome = null;
  let ambientColor = "#5ba88a";
  let iconColor = "#5ba88a";

  if (!hasMeal) {
    headline = mealInsight?.value || "No meal being reviewed";
    body = mealInsight?.sub || "Log nourishment to start a meal window";
    ambientColor = mealInsight?.color || "#d4a056";
    iconColor = ambientColor;
  } else if (state === "reviewing") {
    headline = "Reviewing your meal";
    body = `${carbs}g nourishment`;
    const remainingMs = d.reviewWindowEnd ? d.reviewWindowEnd - Date.now() : null;
    const remaining = remainingMs != null ? formatRemaining(remainingMs) : null;
    outcome = remaining ? { text: `${remaining} remaining in window`, icon: "clock", color: REVIEW_BLUE } : null;
    ambientColor = REVIEW_BLUE;
    iconColor = REVIEW_BLUE;
  } else {
    headline = "Meal window complete";
    body = `${carbs}g nourishment reviewed`;
    const o = getCompletedOutcome(d);
    outcome = { text: o.label, icon: null, color: o.color };
    ambientColor = o.color;
    iconColor = o.color;
  }

  const showFooter = highProteinFatStatus?.isActive;

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className="metric-card relative col-span-2 w-full overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        background: "linear-gradient(152deg, rgba(255,255,255,0.04), rgba(255,255,255,0.008))",
        borderColor: "rgba(255,255,255,0.09)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.10)",
      }}
    >
      {/* ambient glow (right side) */}
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <motion.div
          animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="h-16 w-16 rounded-full"
          style={{
            background: `radial-gradient(circle, ${ambientColor}cc 0%, ${ambientColor}44 50%, transparent 75%)`,
            filter: "blur(10px)",
          }}
        />
      </div>
      {/* faint decorative emblem inside the glow */}
      <Sprout
        className="pointer-events-none absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2"
        style={{ color: ambientColor, opacity: 0.1 }}
        strokeWidth={1.5}
      />

      {/* header */}
      <div className="relative z-10 mb-2 flex items-start justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Meal Balance</span>
        <button
          onClick={onOpenTooltip}
          className="text-white/25 transition-colors hover:text-white/55"
          aria-label="Meal Balance details"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* content */}
      <div className="relative z-10 flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: `${iconColor}55`, background: `${iconColor}14` }}
        >
          <StateIcon state={state} color={iconColor} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight text-white">{headline}</p>
          <p className="mt-0.5 text-[11px] text-white/40">{body}</p>
        </div>
      </div>

      {/* outcome line */}
      {outcome && (
        <div className="relative z-10 mt-2.5 flex items-center gap-1.5 pl-11">
          {outcome.icon === "clock" && <Clock className="h-3 w-3 shrink-0" style={{ color: outcome.color }} />}
          <span className="text-[11px] font-semibold" style={{ color: outcome.color }}>{outcome.text}</span>
        </div>
      )}

      {/* footer: high protein / fat monitoring */}
      {showFooter && (
        <div className="relative z-10 mt-3 space-y-1 border-t border-white/10 pt-2.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400/80" />
            <span className="text-[11px] font-semibold text-amber-400/90">Delayed meal response possible</span>
          </div>
          <p className="pl-[18px] text-[10px] font-medium text-amber-400/60">
            Monitor through {formatMonitoringEndTime(highProteinFatStatus.endTime)}
          </p>
        </div>
      )}
    </motion.div>
  );
}