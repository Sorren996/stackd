import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Calculator, Check, CheckCircle2, ChevronDown, Clock, Droplet, Info, Plus, Shield, Sprout } from "lucide-react";
import MealUsualResponse from "@/components/insulin/MealUsualResponse";

const PALETTE = {
  green: "#58a97c",
  blue: "#5f8cf5",
  amber: "#d4a056",
  muted: "#8a9496",
  cardBg: "linear-gradient(150deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))"
};

const TREND_ARROW = {
  up: "↑",
  "up-right": "↗",
  right: "→",
  "down-right": "↘",
  down: "↓"
};

function formatElapsed(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function SectionLabel({ children }) {
  return <p className="stackd-section-label">{children}</p>;
}

function Divider() {
  return <div className="h-px w-full" style={{ background: "rgba(255,255,255,0.06)" }} />;
}

function ExpandableRow({ icon: Icon, label, labelColor, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-2.5 text-left transition hover:bg-white/[0.03]">
        
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.muted }} strokeWidth={2} />}
        <span className="flex-1 text-[11px] font-semibold" style={{ color: labelColor || "rgba(255,255,255,0.55)" }}>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: PALETTE.muted }} strokeWidth={2} />
      </button>
      <AnimatePresence initial={false}>
        {open &&
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden">
          
            <div className="pb-1 pt-0.5">{children}</div>
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}

function EstimateRow({ label, sublabel, value, icon: Icon, iconColor, valueColor }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2">
        {Icon &&
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: iconColor }}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        }
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white">{label}</p>
          {sublabel && <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: PALETTE.muted }}>{sublabel}</p>}
        </div>
      </div>
      <span className="shrink-0 text-[13px] font-bold" style={{ color: valueColor || "rgba(255,255,255,0.9)" }}>
        {value}
      </span>
    </div>);

}

function SummaryCell({ label, value, sub }) {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <p className="text-lg font-bold text-white whitespace-nowrap">{value}</p>
      <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      {sub && <p className="mt-0.5 text-[9px]" style={{ color: PALETTE.muted }}>{sub}</p>}
    </div>);

}

/**
 * Inline meal review content — the same information that lived inside the
 * MealBalanceTooltip modal, now rendered directly on the Dashboard inside
 * the RhythmSection's "Meal Review" tab. No modal, no backdrop, no close
 * button. All existing calculations and logic are preserved verbatim.
 */
export default function MealReviewContent({ mealInsight, monitoringStatus, glucoseTrend, onResolve }) {
  if (!mealInsight) return null;

  const openLogger = (mode) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("stackd-open-log", { detail: { mode } }));
    }
  };

  // Onboarding / setup state — no meal details yet
  if (!mealInsight.details) {
    const needsSetup = mealInsight.value === "Setup needed";
    return (
      <div className="relative overflow-hidden rounded-2xl p-4">
        <div className="space-y-4">
          <div
            className="flex items-start gap-2.5 rounded-xl border p-3"
            style={{ borderColor: `${mealInsight.color}30`, background: `${mealInsight.color}0a` }}>
            
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${mealInsight.color}1a`, color: mealInsight.color }}>
              
              <Sprout className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold" style={{ color: mealInsight.color }}>
                {mealInsight.value}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>{mealInsight.status}</p>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
            {needsSetup ?
            "Once you add your insulin-to-carb ratio and sensitivity in Settings, your meal balance estimates will appear here." :
            "Log a meal to open a review window. Meal Balance gently compares your nourishment and support so you can see how your rhythm is lining up."}
          </p>

          <div className="border-t border-white/[0.06]">
            <ExpandableRow icon={BookOpen} label="About Meal Balance">
              <div className="space-y-2 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
                <p>
                  <span className="font-semibold text-white/55">Nourishment</span> — your carbs are compared to your saved meal ratio to estimate the support your meal typically calls for.
                </p>
                <p>
                  <span className="font-semibold text-white/55">Glucose adjustment</span> — if a reading near your meal is above your range, a little extra support is previewed based on your sensitivity.
                </p>
                <p>
                  <span className="font-semibold text-white/55">Support logged</span> — the insulin you already logged is compared to that preview so you can see how things line up.
                </p>
                <p className="pt-1 text-[10px]" style={{ color: PALETTE.muted, opacity: 0.6 }}>
                  Meal Balance is reflective and descriptive. It does not recommend dosing or replace your established treatment plan.
                </p>
              </div>
            </ExpandableRow>
          </div>
        </div>
      </div>);

  }

  // Full meal review — identical to the modal content
  const d = mealInsight.details;
  const carbs = Math.round(d.meal?.carbs || 0);
  const loggedUnits = d.loggedTotalUnits || 0;
  const expectedMealUnits = d.expectedMealUnits || 0;
  const grossDoseEstimate = d.grossDoseEstimate || 0;
  const remainingEstimate = d.estimatedAdditionalUnits || 0;
  const correctionUnitsNeeded = d.correctionUnitsNeeded || 0;
  const glucoseStart = d.correctionGlucoseValue;
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue : d.windowEndGlucoseValue;
  const peakOutcome = d.peakOutcome;
  const peakOutcomeTime = d.peakOutcomeTime;
  const mealTime = d.meal?.time;
  const activeInsulin = d.bolusIOB || 0;

  const fmtUnits = (v) => v % 1 === 0 ? String(v) : v.toFixed(1);
  const ratioText = d.gramsPerUnit ? `1u per ${d.gramsPerUnit.toFixed(1)}g` : null;
  const isAccountedFor = remainingEstimate <= 0.01;
  const hasGlucoseAdjustment = correctionUnitsNeeded > 0.01;

  const hasCurrentGlucose = Number.isFinite(glucoseNow);
  const glucoseChange = hasCurrentGlucose && Number.isFinite(glucoseStart) ? glucoseNow - glucoseStart : null;
  const elapsedMs = Number.isFinite(mealTime) ? Date.now() - mealTime : null;
  const trendArrow = glucoseTrend?.icon ? TREND_ARROW[glucoseTrend.icon] : null;
  const peakAfterMs = Number.isFinite(peakOutcomeTime) && Number.isFinite(mealTime) ? peakOutcomeTime - mealTime : null;

  const changeColor = glucoseChange === null ? PALETTE.muted :
  glucoseChange > 0 ? PALETTE.amber :
  glucoseChange < 0 ? PALETTE.green :
  PALETTE.muted;

  return (
    <div className="relative overflow-hidden rounded-2xl p-4">
      <div className="flex flex-col">
        {/* PRIMARY MEAL STATUS */}
        <section className="px-1 pt-1 pb-4">
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${mealInsight.color}1a`, color: mealInsight.color }}>
              
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight text-white">{mealInsight.value}</p>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>{mealInsight.status}</p>
            </div>
          </div>
        </section>

        {/* CURRENT GLUCOSE */}
        {hasCurrentGlucose &&
        <>
            <Divider />
            <section className="px-1 py-4">
              <SectionLabel>Current Glucose</SectionLabel>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black leading-none text-white">{Math.round(glucoseNow)}</span>
                    <span className="text-[11px] font-medium text-white/40">mg/dL</span>
                    {trendArrow &&
                  <span className="ml-0.5 text-lg font-bold" style={{ color: glucoseTrend?.color || PALETTE.muted }}>
                        {trendArrow}
                      </span>
                  }
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {glucoseChange !== null &&
                <p className="text-[13px] font-bold" style={{ color: changeColor }}>
                      {glucoseChange > 0 ? "+" : ""}{Math.round(glucoseChange)}
                      <span className="ml-0.5 text-[10px] font-medium" style={{ color: PALETTE.muted }}>mg/dL</span>
                    </p>
                }
                  {elapsedMs !== null &&
                <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>{formatElapsed(elapsedMs)} since meal</p>
                }
                </div>
              </div>
              <p className="mt-1.5 text-[10px]" style={{ color: PALETTE.muted, opacity: 0.7 }}>
                {glucoseChange !== null ? "since you began this meal" : "latest reading"}
              </p>
            </section>
          </>
        }

        {/* MEAL SUMMARY */}
        <Divider />
        <section className="px-1 py-4">
          <SectionLabel>Meal Summary</SectionLabel>
          <div className="mt-2.5 grid grid-cols-3 divide-x divide-white/[0.06]">
            <SummaryCell label="Carbs" value={`${carbs}g`} />
            <SummaryCell label="Logged" value={`${fmtUnits(loggedUnits)}u`} />
            <SummaryCell
              label="Peak"
              value={Number.isFinite(peakOutcome) ? Math.round(peakOutcome) : "—"}
              sub={peakAfterMs !== null ? `${formatElapsed(peakAfterMs)} after` : null} />
            
          </div>
        </section>

        {/* MEAL DETAILS */}
        <Divider />
        <section className="px-1 py-4">
          <SectionLabel>Meal Details</SectionLabel>
          <div className="mt-1 divide-y divide-white/[0.06]">
            <EstimateRow
              label="Meal estimate"
              sublabel={ratioText ? `Based on ${carbs}g · your saved ratio · ${ratioText}` : `Based on ${carbs}g and your saved meal ratio`}
              value={`${fmtUnits(expectedMealUnits)}u`}
              icon={Calculator}
              iconColor={PALETTE.green}
              valueColor={PALETTE.green} />
            
            <EstimateRow
              label="Active insulin"
              sublabel="Estimated insulin still working"
              value={`${fmtUnits(activeInsulin)}u`}
              icon={Droplet}
              iconColor={PALETTE.blue}
              valueColor={PALETTE.blue} />
            
            <EstimateRow
              label="Insulin logged"
              sublabel="During this meal window"
              value={`${fmtUnits(loggedUnits)}u`}
              icon={Shield}
              iconColor={PALETTE.blue}
              valueColor={PALETTE.blue} />
            
            <EstimateRow
              label={isAccountedFor ? "Meal estimate accounted for" : "Remaining meal estimate"}
              sublabel={isAccountedFor ? "No remaining meal estimate" : "Based on your saved ratio"}
              value={`${fmtUnits(remainingEstimate)}u`}
              icon={Check}
              iconColor={isAccountedFor ? PALETTE.green : mealInsight.color}
              valueColor={isAccountedFor ? PALETTE.green : mealInsight.color} />
            
          </div>
        </section>

        {/* YOUR USUAL RESPONSE */}
        <Divider />
        <section className="px-1 py-4">
          <MealUsualResponse
            carbs={carbs}
            mealName={d.meal?.food_name || d.meal?.name}
            currentPeak={Number.isFinite(peakOutcome) ? peakOutcome : null} />
          
        </section>

        {/* PRIMARY ACTIONS */}
        <Divider />
        
















        

        {/* Progressive disclosure */}
        <div className="px-1">
          <ExpandableRow icon={Info} label="Why this estimate?" labelColor="#7ba997">
            <div className="rounded-lg border border-white/[0.06] p-3" style={{ background: PALETTE.cardBg }}>
              <div className="space-y-2 text-[11px] leading-relaxed">
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ color: PALETTE.muted }}>{carbs}g carbs</span>
                  <span className="text-[10px]" style={{ color: PALETTE.muted }}>÷ your saved meal ratio{ratioText ? ` (${ratioText})` : ""}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-white/65">Meal estimate</span>
                  <span className="font-bold text-white/80">{fmtUnits(expectedMealUnits)}u</span>
                </div>
                {hasGlucoseAdjustment &&
                <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] pt-2">
                    <span style={{ color: PALETTE.muted }}>Glucose adjustment</span>
                    <span className="font-bold text-white/65">+{fmtUnits(correctionUnitsNeeded)}u</span>
                  </div>
                }
                <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] pt-2">
                  <span style={{ color: PALETTE.muted }}>Total estimate</span>
                  <span className="font-bold text-white/65">{fmtUnits(grossDoseEstimate)}u</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] pt-2">
                  <span style={{ color: PALETTE.muted }}>Insulin already logged</span>
                  <span className="font-bold text-white/65">−{fmtUnits(loggedUnits)}u</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] pt-2">
                  <span className="font-bold uppercase tracking-wider text-white/55" style={{ fontSize: "10px" }}>
                    {isAccountedFor ? "Remaining" : "Remaining estimate"}
                  </span>
                  <span className="text-[14px] font-bold" style={{ color: isAccountedFor ? PALETTE.green : mealInsight.color }}>
                    {fmtUnits(remainingEstimate)}u
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed" style={{ color: PALETTE.muted, opacity: 0.7 }}>
                A reflective estimate based on your saved settings. Follow your established treatment plan.
              </p>
            </div>
          </ExpandableRow>

          <div className="border-t border-white/[0.06]">
            <ExpandableRow icon={BookOpen} label="About Meal Balance">
              <div className="space-y-2 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
                <p>
                  <span className="font-semibold text-white/55">Nourishment</span> — your carbs are compared to your saved meal ratio to estimate the support your meal typically calls for.
                </p>
                <p>
                  <span className="font-semibold text-white/55">Glucose adjustment</span> — if a reading near your meal is above your range, a little extra support is previewed based on your sensitivity.
                </p>
                <p>
                  <span className="font-semibold text-white/55">Support logged</span> — the insulin you already logged is compared to that preview so you can see how things line up.
                </p>
                <p className="pt-1 text-[10px]" style={{ color: PALETTE.muted, opacity: 0.6 }}>
                  Meal Balance is reflective and descriptive. It does not recommend dosing or replace your established treatment plan.
                </p>
              </div>
            </ExpandableRow>
          </div>
        </div>

        {/* High protein/fat monitoring notice */}
        {monitoringStatus?.isActive &&
        <div
          className="mt-4 rounded-xl border p-3"
          style={{ borderColor: "rgba(217,169,56,0.2)", background: "rgba(217,169,56,0.05)" }}>
          
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
              <p className="text-[11px] font-semibold text-amber-400/90">Delayed meal response possible</p>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: PALETTE.muted, opacity: 0.7 }}>
              A high protein or fat meal may have delayed or prolonged glucose effects. Continue monitoring through{" "}
              <span className="font-medium text-amber-400/70">
                {new Date(monitoringStatus.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
              .
            </p>
            <p className="mt-1.5 text-[10px] leading-relaxed italic" style={{ color: PALETTE.muted, opacity: 0.6 }}>
              {d.latestGlucoseValue === null || d.latestGlucoseValue === undefined ?
            "Current glucose data is unavailable. Check your connected glucose source or monitor using your usual method." :
            glucoseTrend?.label === "Rising" || glucoseTrend?.label === "Slowly rising" ?
            "Glucose is currently rising. Continue watching the trend and follow your established plan." :
            glucoseTrend?.label === "Falling" || glucoseTrend?.label === "Slowly falling" ?
            "Glucose is currently falling. Consider insulin already active and continue monitoring closely." :
            "Glucose is currently stable. Delayed changes may still occur during this monitoring period."}
            </p>
          </div>
        }

        {/* Mark as Resolved */}
        {d.mealStillUnderReview && onResolve &&
        <button
          type="button"
          onClick={onResolve}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-semibold transition hover:brightness-110"
          style={{
            borderColor: `${PALETTE.green}40`,
            background: `${PALETTE.green}12`,
            color: PALETTE.green
          }}>
          
            <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
            Mark as Resolved
          </button>
        }
      </div>
    </div>);

}