import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, BookOpen, Calculator, Check, ChevronDown, Clock, Info, Leaf, Shield, Sprout, X } from "lucide-react";

const PALETTE = {
  green: "#58a97c",
  blue: "#5f8cf5",
  purple: "#8b73f7",
  muted: "#8a9496",
  cardBg: "#151d1e",
  surface: "#0c1314",
};

function TooltipPopover({ title, description, onClose, children }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        onClick={onClose}
        style={{ background: "rgba(8,14,12,0.72)", backdropFilter: "blur(6px)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
          className="relative flex max-h-[min(84dvh,640px)] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
          style={{
            background: PALETTE.surface,
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.06)",
          }}
        >
          <div className="relative z-10 flex min-h-0 flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-4">
              <div className="flex items-start gap-2">
                <Sprout className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PALETTE.green }} strokeWidth={2} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>{description}</p>
                </div>
              </div>
              <button onClick={onClose} className="transition-colors hover:text-white/80" style={{ color: PALETTE.muted }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
              style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
            >
              {children}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MetricCard({ icon: Icon, iconColor, children }) {
  return (
    <div
      className="flex flex-col items-center rounded-xl border px-1.5 py-2 text-center"
      style={{ background: PALETTE.cardBg, borderColor: "rgba(255,255,255,0.06)" }}
    >
      {Icon && <Icon className="mb-1 h-3.5 w-3.5" style={{ color: iconColor }} strokeWidth={2} />}
      {children}
    </div>
  );
}

function ExpandableRow({ icon: Icon, label, labelColor, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left transition hover:bg-white/[0.03]"
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.muted }} strokeWidth={2} />}
        <span className="flex-1 text-[11px] font-semibold" style={{ color: labelColor || "rgba(255,255,255,0.55)" }}>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: PALETTE.muted }} strokeWidth={2} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="pb-1 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EstimateRow({ label, sublabel, value, icon: Icon, iconColor, valueColor }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex min-w-0 items-start gap-2">
        {Icon && (
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: iconColor }}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white">{label}</p>
          {sublabel && <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: PALETTE.muted }}>{sublabel}</p>}
        </div>
      </div>
      <span className="shrink-0 text-[13px] font-bold" style={{ color: valueColor || "rgba(255,255,255,0.9)" }}>
        {value}
      </span>
    </div>
  );
}

export default function MealBalanceTooltip({ mealInsight, open, onClose, monitoringStatus, glucoseTrend }) {
  if (!open || !mealInsight?.details) return null;

  const d = mealInsight.details;
  const carbs = Math.round(d.meal?.carbs || 0);
  const loggedUnits = d.loggedTotalUnits || 0;
  const expectedMealUnits = d.expectedMealUnits || 0;
  const grossDoseEstimate = d.grossDoseEstimate || 0;
  const remainingEstimate = d.estimatedAdditionalUnits || 0;
  const correctionUnitsNeeded = d.correctionUnitsNeeded || 0;
  const glucoseStart = d.correctionGlucoseValue;
  const glucoseNow = d.windowEndGlucoseValue;
  const peakOutcome = d.peakOutcome;
  const hasGlucoseData = glucoseStart !== null && glucoseStart !== undefined;

  const fmtUnits = (v) => (v % 1 === 0 ? String(v) : v.toFixed(1));
  const ratioText = d.gramsPerUnit ? `1u per ${d.gramsPerUnit.toFixed(1)}g` : null;
  const isAccountedFor = remainingEstimate <= 0.01;
  const hasGlucoseAdjustment = correctionUnitsNeeded > 0.01;

  return (
    <TooltipPopover
      title="Meal Balance"
      description="A quick look at your meal and glucose response."
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Window status */}
        <div
          className="flex items-start gap-2.5 rounded-xl border p-3"
          style={{ borderColor: `${PALETTE.green}30`, background: `${PALETTE.green}0a` }}
        >
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${PALETTE.green}1a`, color: PALETTE.green }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold" style={{ color: mealInsight.color }}>
              {mealInsight.value}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>{mealInsight.status}</p>
          </div>
        </div>

        {/* Three key summary metrics */}
        <div className="grid grid-cols-3 gap-1.5">
          <MetricCard icon={Leaf} iconColor={PALETTE.green}>
            <p className="text-base font-bold text-white whitespace-nowrap">{carbs}g</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">Nourishment</p>
            <p className="text-[9px]" style={{ color: PALETTE.muted }}>carbs</p>
          </MetricCard>

          <MetricCard icon={Shield} iconColor={PALETTE.blue}>
            <p className="text-base font-bold text-white whitespace-nowrap">{fmtUnits(loggedUnits)}u</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">Support logged</p>
            <p className="text-[9px]" style={{ color: PALETTE.muted }}>insulin</p>
          </MetricCard>

          {hasGlucoseData && (
            <MetricCard icon={Activity} iconColor={PALETTE.purple}>
              <p className="text-sm font-bold text-white whitespace-nowrap">
                {Math.round(glucoseStart)}
                {glucoseNow !== null && glucoseNow !== undefined && (
                  <>
                    <span className="mx-0.5" style={{ color: PALETTE.green }}>→</span>
                    <span className="text-white">{Math.round(glucoseNow)}</span>
                  </>
                )}
              </p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">Glucose</p>
              <p className="text-[9px]" style={{ color: PALETTE.muted }}>
                {d.mealStillUnderReview ? "start → latest" : "start → end"}
              </p>
              {peakOutcome !== null && peakOutcome !== undefined && (
                <p className="text-[9px]" style={{ color: PALETTE.purple }}>
                  Peak {Math.round(peakOutcome)}
                </p>
              )}
            </MetricCard>
          )}
        </div>

        {/* Estimate Details */}
        <div>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: PALETTE.muted }}>Estimate Details</p>
          <div className="divide-y divide-white/[0.06]">
            <EstimateRow
              label="Meal estimate"
              sublabel={ratioText ? `Based on ${carbs}g and your saved meal ratio · ${ratioText}` : `Based on ${carbs}g and your saved meal ratio`}
              value={`${fmtUnits(expectedMealUnits)}u`}
              icon={Calculator}
              iconColor={PALETTE.green}
              valueColor={PALETTE.green}
            />
            <EstimateRow
              label="Insulin logged"
              sublabel="During this meal window"
              value={`${fmtUnits(loggedUnits)}u`}
              icon={Shield}
              iconColor={PALETTE.blue}
              valueColor={PALETTE.blue}
            />
            <EstimateRow
              label={isAccountedFor ? "Meal estimate accounted for" : "Remaining meal estimate"}
              sublabel={isAccountedFor ? "No remaining meal estimate" : "Based on your saved ratio"}
              value={`${fmtUnits(remainingEstimate)}u`}
              icon={Check}
              iconColor={isAccountedFor ? PALETTE.green : mealInsight.color}
              valueColor={isAccountedFor ? PALETTE.green : mealInsight.color}
            />
          </div>
        </div>

        {/* Why this estimate? */}
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
              {hasGlucoseAdjustment && (
                <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] pt-2">
                  <span style={{ color: PALETTE.muted }}>Glucose adjustment</span>
                  <span className="font-bold text-white/65">+{fmtUnits(correctionUnitsNeeded)}u</span>
                </div>
              )}
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

        {/* About Meal Balance */}
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

        {/* High protein/fat monitoring notice */}
        {monitoringStatus?.isActive && (
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "rgba(217,169,56,0.2)", background: "rgba(217,169,56,0.05)" }}
          >
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
              {d.latestGlucoseValue === null || d.latestGlucoseValue === undefined
                ? "Current glucose data is unavailable. Check your connected glucose source or monitor using your usual method."
                : glucoseTrend?.label === "Rising" || glucoseTrend?.label === "Slowly rising"
                  ? "Glucose is currently rising. Continue watching the trend and follow your established plan."
                  : glucoseTrend?.label === "Falling" || glucoseTrend?.label === "Slowly falling"
                    ? "Glucose is currently falling. Consider insulin already active and continue monitoring closely."
                    : "Glucose is currently stable. Delayed changes may still occur during this monitoring period."}
            </p>
          </div>
        )}
      </div>
    </TooltipPopover>
  );
}