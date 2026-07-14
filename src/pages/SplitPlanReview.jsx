import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import {
  getTotalBolusIOB,
  getDoseStatus,
  getDoseIOB,
  INSULIN_PROFILES,
  isBolusInsulinType,
} from "@/lib/insulinPharmacology";
import { getHighProteinFatMonitoringStatus } from "@/lib/mealMonitoring";
import {
  getPlanStatus,
  formatElapsedTime,
  formatClockTime,
  formatReviewDuration,
  POSTPONE_OPTIONS,
  STATUS_LABELS,
} from "@/lib/splitDoseUtils";
import { NumberPadField, SelectField, TimeScrollField } from "@/components/FormInputFields";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  Activity,
  X,
  Check,
  SkipForward,
  Bell,
  Plus,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";

const MINUTE_MS = 60 * 1000;
const GLUCOSE_STALE_THRESHOLD_MIN = 15;

const TREND_ICONS = {
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
};

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };
  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);
  return { low: Number.isFinite(low) ? low : 70, high: Number.isFinite(high) ? high : 180 };
}

export default function SplitPlanReview() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [showPostponeSheet, setShowPostponeSheet] = useState(false);
  const [logAmount, setLogAmount] = useState("");
  const [logTime, setLogTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ["split-plan", planId],
    queryFn: () => base44.entities.SplitDosePlan.get(planId),
    enabled: Boolean(planId),
  });

  const { data: meal } = useQuery({
    queryKey: ["split-plan-meal", plan?.meal_log_id],
    queryFn: () => base44.entities.CarbEntry.get(plan.meal_log_id),
    enabled: Boolean(plan?.meal_log_id),
  });

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ["glucose-readings", "graph"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 5000),
  });

  const { data: doses = [] } = useQuery({
    queryKey: ["insulin-doses", "graph"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 1000),
  });

  const { data: carbEntries = [] } = useQuery({
    queryKey: ["carb-entries", "graph"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 1000),
  });

  const targetRange = useMemo(() => readTargetRange(), []);

  const mealTime = useMemo(() => {
    if (!meal?.consumed_at) return null;
    return new Date(meal.consumed_at).getTime();
  }, [meal]);

  const planStatus = useMemo(() => getPlanStatus(plan, now), [plan, now]);

  const firstDose = useMemo(() => {
    if (!plan?.first_dose_log_id) return null;
    return doses.find((d) => d.id === plan.first_dose_log_id) || null;
  }, [doses, plan]);

  const followUpDose = useMemo(() => {
    if (!plan?.follow_up_dose_log_id) return null;
    return doses.find((d) => d.id === plan.follow_up_dose_log_id) || null;
  }, [doses, plan]);

  const additionalInsulin = useMemo(() => {
    if (!plan?.first_dose_log_id || !firstDose) return [];
    const firstDoseTime = new Date(firstDose.administered_at).getTime();
    return doses.filter((d) => {
      if (d.id === plan.first_dose_log_id || d.id === plan.follow_up_dose_log_id) return false;
      const doseTime = new Date(d.administered_at).getTime();
      return doseTime > firstDoseTime;
    });
  }, [doses, plan, firstDose]);

  const carbsAfterMeal = useMemo(() => {
    if (!mealTime) return [];
    return carbEntries.filter((e) => {
      const entryTime = new Date(e.consumed_at).getTime();
      return entryTime > mealTime + 30 * MINUTE_MS;
    });
  }, [carbEntries, mealTime]);

  const latestGlucose = glucoseReadings[0] || null;
  const secondGlucose = glucoseReadings[1] || null;

  const trend = useMemo(() => {
    if (!latestGlucose || !secondGlucose) return { icon: "right", label: "Stable" };
    const diff = Number(latestGlucose.value) - Number(secondGlucose.value);
    if (diff >= 7) return { icon: "up", label: "Rising" };
    if (diff >= 4) return { icon: "up-right", label: "Slowly rising" };
    if (diff >= -3) return { icon: "right", label: "Stable" };
    if (diff >= -6) return { icon: "down-right", label: "Slowly falling" };
    return { icon: "down", label: "Falling" };
  }, [latestGlucose, secondGlucose]);

  const glucoseAgeMin = latestGlucose?.recorded_at
    ? Math.floor((now - new Date(latestGlucose.recorded_at).getTime()) / MINUTE_MS)
    : null;

  const isGlucoseStale = glucoseAgeMin !== null && glucoseAgeMin > GLUCOSE_STALE_THRESHOLD_MIN;
  const isGlucoseMissing = !latestGlucose;
  const isGlucoseLow = latestGlucose && Number(latestGlucose.value) < targetRange.low;
  const isGlucoseFalling = trend.icon === "down" || trend.icon === "down-right";

  const activeIOB = useMemo(() => getTotalBolusIOB(doses, now), [doses, now]);

  const hpfStatus = useMemo(
    () => getHighProteinFatMonitoringStatus(meal ? [meal] : []),
    [meal, now]
  );

  const elapsedSinceMeal = mealTime ? formatElapsedTime(mealTime, now) : "";

  const logFollowUp = useMutation({
    mutationFn: async ({ amount, time }) => {
      const [hours, minutes] = time.split(":").map(Number);
      const administeredAt = new Date();
      administeredAt.setHours(hours, minutes, 0, 0);
      if (administeredAt.getTime() > Date.now()) {
        throw new Error("Choose a time that is not in the future.");
      }

      const dose = await base44.entities.InsulinDose.create({
        insulin_type: plan.insulin_type,
        units: amount,
        administered_at: administeredAt.toISOString(),
        notes: "Follow-up portion — split dose plan",
      });

      const isModified = Math.abs(amount - plan.follow_up_planned_units) > 0.01;

      await base44.entities.SplitDosePlan.update(plan.id, {
        follow_up_dose_log_id: dose.id,
        follow_up_actual_units: amount,
        follow_up_decision_at: new Date().toISOString(),
        status: isModified ? "modified" : "completed",
      });

      return { dose, isModified };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      queryClient.invalidateQueries({ queryKey: ["split-plan", planId] });
      queryClient.invalidateQueries({ queryKey: ["split-plans"] });
      toast.success(data.isModified ? "Follow-up logged — plan modified" : "Follow-up logged — plan completed");
      setShowLogSheet(false);
      setIsSubmitting(false);
    },
    onError: (error) => {
      toast.error(error?.message || "Unable to log follow-up. Please try again.");
      setIsSubmitting(false);
    },
  });

  const skipFollowUp = useMutation({
    mutationFn: async () => {
      await base44.entities.SplitDosePlan.update(plan.id, {
        status: "skipped",
        follow_up_decision_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["split-plan", planId] });
      queryClient.invalidateQueries({ queryKey: ["split-plans"] });
      toast.success("Remaining portion skipped");
    },
  });

  const postponeReview = useMutation({
    mutationFn: async (minutes) => {
      const newReviewAt = new Date(Date.now() + minutes * MINUTE_MS).toISOString();
      await base44.entities.SplitDosePlan.update(plan.id, {
        current_review_at: newReviewAt,
        status: "postponed",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["split-plan", planId] });
      queryClient.invalidateQueries({ queryKey: ["split-plans"] });
      toast.success("Review postponed");
      setShowPostponeSheet(false);
    },
  });

  const handleOpenLogSheet = (defaultAmount) => {
    setLogAmount(String(defaultAmount ?? plan?.follow_up_planned_units ?? ""));
    setLogTime(new Date().toTimeString().slice(0, 5));
    setShowLogSheet(true);
  };

  const handleConfirmLog = () => {
    const amount = Number(logAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid insulin amount.");
      return;
    }
    setIsSubmitting(true);
    logFollowUp.mutate({ amount, time: logTime });
  };

  if (planLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Activity className="h-8 w-8 animate-pulse text-white/30" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-white/45">This plan could not be found.</p>
        <button onClick={() => navigate("/")} className="mt-4 text-sm text-teal-300/80 underline">
          Return to your flow
        </button>
      </div>
    );
  }

  const TrendIcon = TREND_ICONS[trend.icon] || ArrowRight;
  const isTerminal = ["completed", "modified", "skipped", "expired", "cancelled"].includes(planStatus);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-28 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-9 w-9 items-center justify-center rounded-full border text-white/60 transition hover:text-white"
          style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Meal Plan Review</h1>
          <p className="text-xs text-white/40">{STATUS_LABELS[planStatus]}</p>
        </div>
      </div>

      {/* Meal summary */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-bold uppercase tracking-widest text-white/40">{plan.meal_name || "Meal"}</p>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
          <InfoRow label="Meal time" value={mealTime ? formatClockTime(mealTime) : "--"} />
          <InfoRow label="Time elapsed" value={elapsedSinceMeal || "--"} />
          <InfoRow label="Total planned" value={`${plan.total_planned_units} units`} />
          <InfoRow label="First portion" value={firstDose ? `${firstDose.units} units logged` : "Not logged"} />
          <InfoRow label="Planned remaining" value={`${plan.follow_up_planned_units} units`} />
          {plan.follow_up_actual_units != null && (
            <InfoRow label="Actual follow-up" value={`${plan.follow_up_actual_units} units`} />
          )}
          <InfoRow label="Review after" value={formatReviewDuration(plan.review_after_minutes)} />
          <InfoRow label="Insulin type" value={plan.insulin_type || "--"} />
        </div>
      </div>

      {/* Safety states */}
      {!isTerminal && (
        <>
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Time to review your meal plan
          </p>
          <p className="-mt-2 px-1 text-xs leading-relaxed text-white/45">
            Review your current glucose, direction, recent insulin, and active insulin before deciding whether to log a follow-up portion.
          </p>

          {/* Glucose status */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-white/35">Current Glucose</p>
            {isGlucoseMissing ? (
              <SafetyMessage
                title="Current glucose unavailable"
                message="Log a glucose reading to see where you are right now."
                color="#d4a056"
                actionLabel="Log glucose"
                onAction={() => navigate("/")}
              />
            ) : isGlucoseStale ? (
              <SafetyMessage
                title="Glucose data may be outdated"
                message="Check a current glucose reading before making a treatment decision."
                color="#d4a056"
                glucoseValue={latestGlucose?.value}
                glucoseTime={formatElapsedTime(latestGlucose?.recorded_at, now)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-white">{latestGlucose.value}</span>
                <span className="text-xs text-white/40">mg/dL</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <TrendIcon className="h-4 w-4" style={{ color: isGlucoseLow ? "#6b92c4" : "#5ba88a" }} />
                  <span className="text-xs font-medium text-white/60">{trend.label}</span>
                </div>
              </div>
            )}
            {!isGlucoseMissing && (
              <p className="mt-2 text-[10px] text-white/30">
                Reading from {formatElapsedTime(latestGlucose?.recorded_at, now)}
              </p>
            )}
          </div>

          {/* Caution states */}
          {isGlucoseFalling && !isGlucoseLow && (
            <CautionCard
              title="Glucose is currently trending down"
              message="Review your established treatment plan and active insulin before making a dosing decision."
              color="#6b92c4"
            />
          )}
          {isGlucoseLow && (
            <CautionCard
              title="Glucose is below your comfort zone"
              message="Take care of your glucose first. You can still log insulin that was already administered, but consider whether now is the right moment."
              color="#6b92c4"
            />
          )}
          {additionalInsulin.length > 0 && (
            <CautionCard
              title="Additional insulin has been logged since this plan was created"
              message={`${additionalInsulin.length} dose${additionalInsulin.length > 1 ? "s" : ""} logged after the first portion. Review your active insulin before deciding on the remaining portion.`}
              color="#d4a056"
              items={additionalInsulin.map((d) => ({
                label: `${d.insulin_type} · ${d.units}u`,
                time: formatClockTime(d.administered_at),
              }))}
            />
          )}

          {/* Active insulin */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Active Insulin (IOB)</p>
              <span className="text-lg font-bold text-white">{activeIOB.toFixed(1)}u</span>
            </div>
            {hpfStatus.isActive && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-white/8 pt-2">
                <AlertTriangle className="h-3 w-3 text-amber-400/80" />
                <span className="text-[11px] text-amber-400/70">High protein/fat window still active</span>
              </div>
            )}
          </div>

          {carbsAfterMeal.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Carbs Logged After Meal</p>
              {carbsAfterMeal.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-white/60">{c.food_name || c.name}</span>
                  <span className="text-white/40">{c.carbs}g · {formatClockTime(c.consumed_at)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => handleOpenLogSheet(plan.follow_up_planned_units)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white transition"
              style={{
                background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
                boxShadow: "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)",
              }}
            >
              <Check className="h-4 w-4" />
              Log as administered
            </button>
            <div className="grid grid-cols-3 gap-2.5">
              <ActionButton icon={Plus} label="Change amount" onClick={() => handleOpenLogSheet(plan.follow_up_planned_units)} />
              <ActionButton icon={SkipForward} label="Skip remaining" onClick={() => skipFollowUp.mutate()} />
              <ActionButton icon={Clock} label="Review later" onClick={() => setShowPostponeSheet(true)} />
            </div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full py-2 text-sm font-medium text-white/40 transition hover:text-white/60"
            >
              Close
            </button>
          </div>
        </>
      )}

      {/* Terminal state display */}
      {isTerminal && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-sm font-semibold text-white">{STATUS_LABELS[planStatus]}</p>
          {plan.follow_up_decision_at && (
            <p className="mt-1 text-xs text-white/40">Decided {formatElapsedTime(plan.follow_up_decision_at, now)}</p>
          )}
          {followUpDose && (
            <p className="mt-2 text-xs text-white/60">
              Follow-up: {followUpDose.units} units logged at {formatClockTime(followUpDose.administered_at)}
            </p>
          )}
        </div>
      )}

      {/* Log follow-up sheet */}
      <AnimatePresence>
        {showLogSheet && (
          <LogFollowUpSheet
            amount={logAmount}
            setAmount={setLogAmount}
            time={logTime}
            setTime={setLogTime}
            plannedAmount={plan.follow_up_planned_units}
            insulinType={plan.insulin_type}
            onConfirm={handleConfirmLog}
            onClose={() => setShowLogSheet(false)}
            isSubmitting={isSubmitting}
          />
        )}
      </AnimatePresence>

      {/* Postpone sheet */}
      <AnimatePresence>
        {showPostponeSheet && (
          <PostponeSheet
            onSelect={(minutes) => postponeReview.mutate(minutes)}
            onClose={() => setShowPostponeSheet(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-white/80">{value}</p>
    </div>
  );
}

function SafetyMessage({ title, message, color, glucoseValue, glucoseTime, actionLabel, onAction }) {
  return (
    <div>
      <p className="text-sm font-semibold" style={{ color }}>{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/45">{message}</p>
      {glucoseValue && (
        <p className="mt-2 text-xs text-white/50">Last reading: {glucoseValue} mg/dL · {glucoseTime}</p>
      )}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-3 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/70">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function CautionCard({ title, message, color, items }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: `${color}30`, background: `${color}0d` }}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color }}>{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/50">{message}</p>
          {items && (
            <div className="mt-2 space-y-1">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-white/60">{item.label}</span>
                  <span className="text-white/35">{item.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] py-2 text-[10px] font-medium text-white/60 transition hover:text-white/80"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function LogFollowUpSheet({ amount, setAmount, time, setTime, plannedAmount, insulinType, onConfirm, onClose, isSubmitting }) {
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
        style={{ background: "linear-gradient(165deg, hsl(162,12%,9%), hsl(162,10%,6%))", borderColor: "rgba(255,255,255,0.14)", boxShadow: "0 -24px 60px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Log follow-up portion</h3>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border text-white/60" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-white/45">
          You are logging that this insulin was administered. Confirm the amount and time before saving.
        </p>

        <div className="space-y-3">
          <NumberPadField label="Amount" value={amount} onChange={setAmount} unit="units" placeholder="0" maxLength={4} large />
          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/35">Planned amount</span>
            <span className="text-sm font-semibold text-white/60">{plannedAmount} units</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/35">Insulin type</span>
            <span className="text-sm font-semibold text-white/60">{insulinType || "--"}</span>
          </div>
          <TimeScrollField label="Administered at" value={time} onChange={setTime} />
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting || !amount || Number(amount) <= 0}
          className="mt-4 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
          style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))", boxShadow: "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)" }}
        >
          {isSubmitting ? "Logging..." : "Confirm and log"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function PostponeSheet({ onSelect, onClose }) {
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
        style={{ background: "linear-gradient(165deg, hsl(162,12%,9%), hsl(162,10%,6%))", borderColor: "rgba(255,255,255,0.14)", boxShadow: "0 -24px 60px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Review later</h3>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border text-white/60" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {POSTPONE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-medium text-white/70 transition hover:text-white"
            >
              <Bell className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}