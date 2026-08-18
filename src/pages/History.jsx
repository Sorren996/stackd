import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronLeft, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { DateScrollField, TimeScrollField, NumberPadField, TextPadField, SelectField } from "@/components/FormInputFields";
import HighProteinFatCheckbox from "@/components/HighProteinFatCheckbox";
import { cancelSplitPlansForMeal, cleanupSplitPlansForDose } from "@/lib/splitDoseUtils";
import { groupDaysByMonth, groupDaysByWeek, monthStats, weekStats, trendSummary } from "@/lib/historyAggregations";
import HistoryMonthView from "@/components/history/HistoryMonthView";
import HistoryWeekView from "@/components/history/HistoryWeekView";
import HistoryDayView from "@/components/history/HistoryDayView";
import HistoryTimelineView from "@/components/history/HistoryTimelineView";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
}

function normalizeCarbEntry(entry) {
  const consumedAt = entry.consumed_at || entry.recorded_at || entry.created_date || entry.created_at;
  const carbs = Number(entry.carbs ?? entry.carbs_grams ?? entry.total_carbs ?? entry.totalCarbs ?? 0);
  const name = entry.food_name || entry.name || "Estimated meal";

  return {
    ...entry,
    id: entry.id || entry._id || `${consumedAt}-${name}-${carbs}`,
    name,
    food_name: name,
    carbs: Number.isFinite(carbs) ? carbs : 0,
    consumed_at: consumedAt,
  };
}

function toTimeValue(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toTimeString().slice(0, 5) : date.toTimeString().slice(0, 5);
}

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toDateValue(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) return getTodayDateValue();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mergeDateTime(dateValue, timeValue) {
  const [hours, minutes] = String(timeValue || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const date = dateValue ? new Date(dateValue + "T00:00:00") : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() > Date.now()) return null;
  return date.toISOString();
}

function replaceCachedItem(queryClient, queryKey, updatedItem) {
  queryClient.setQueryData(queryKey, (current = []) =>
    Array.isArray(current) ? current.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item)) : current
  );
}

function getEditInitialForm(log) {
  if (!log) return {};
  if (log.type === "insulin") {
    return {
      insulin_type: log.item.insulin_type || "",
      units: String(log.item.units ?? ""),
      meal_units: String(log.item.meal_units ?? ""),
      correction_units: String(log.item.correction_units ?? ""),
      date: toDateValue(log.item.administered_at),
      time: toTimeValue(log.item.administered_at),
      notes: log.item.notes || "",
    };
  }
  if (log.type === "glucose") {
    return {
      value: String(log.item.value ?? ""),
      date: toDateValue(log.item.recorded_at),
      time: toTimeValue(log.item.recorded_at),
      notes: log.item.notes || "",
    };
  }
  return {
    food_name: log.item.food_name || log.item.name || "",
    carbs: String(log.item.carbs ?? ""),
    absorption_profile: log.item.absorption_profile || log.item.profile || "medium",
    is_high_protein_fat_meal: log.item.is_high_protein_fat_meal || false,
    date: toDateValue(log.item.consumed_at),
    time: toTimeValue(log.item.consumed_at),
    notes: log.item.notes || "",
  };
}

const insulinTypeOptions = Object.entries(INSULIN_PROFILES).map(([name, profile]) => ({
  value: name,
  label: name,
  description: profile.category,
}));

const absorptionProfileOptions = [
  { value: "fast", label: "Fast", description: "Fast carbs" },
  { value: "medium", label: "Medium", description: "Balanced carbs" },
  { value: "slow", label: "Slow", description: "Slow carbs" },
];

function EditLogSheet({ log, onClose, onSave, isSaving }) {
  const [form, setForm] = useState(() => getEditInitialForm(log));
  const todayDateValue = getTodayDateValue();
  const nowTimeString = new Date().toTimeString().slice(0, 5);

  useEffect(() => {
    setForm(getEditInitialForm(log));
  }, [log]);

  if (!log) return null;

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const title = log.type === "insulin" ? "Edit Insulin" : log.type === "glucose" ? "Edit Glucose" : "Edit Carbs";

  const submit = () => {
    if (log.type === "insulin") {
      const units = Number(form.units);
      if (!form.insulin_type || !Number.isFinite(units) || units <= 0) return;
      const administeredAt = mergeDateTime(form.date, form.time);
      if (!administeredAt) {
        toast.error("Choose a time that is not in the future.");
        return;
      }
      const mealUnits = form.meal_units === "" ? undefined : Number(form.meal_units);
      const correctionUnits = form.correction_units === "" ? undefined : Number(form.correction_units);
      onSave({
        type: "insulin",
        id: log.item.id,
        patch: {
          insulin_type: form.insulin_type,
          units,
          meal_units: Number.isFinite(mealUnits) ? mealUnits : undefined,
          correction_units: Number.isFinite(correctionUnits) ? correctionUnits : undefined,
          administered_at: administeredAt,
          notes: form.notes || undefined,
        },
      });
      return;
    }

    if (log.type === "glucose") {
      const value = Number(form.value);
      if (!Number.isFinite(value) || value <= 0) return;
      const recordedAt = mergeDateTime(form.date, form.time);
      if (!recordedAt) {
        toast.error("Choose a time that is not in the future.");
        return;
      }
      onSave({
        type: "glucose",
        id: log.item.id,
        patch: {
          value,
          recorded_at: recordedAt,
          notes: form.notes || undefined,
        },
      });
      return;
    }

    const carbs = Number(form.carbs);
    if (!Number.isFinite(carbs) || carbs <= 0) return;
    const consumedAt = mergeDateTime(form.date, form.time);
    if (!consumedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }
    onSave({
      type: "carbs",
      id: log.item.id,
      patch: {
        name: form.food_name || "Food",
        food_name: form.food_name || "Food",
        carbs,
        absorption_profile: form.absorption_profile || "medium",
        profile: form.absorption_profile || "medium",
        consumed_at: consumedAt,
        notes: form.notes || undefined,
        is_high_protein_fat_meal: form.is_high_protein_fat_meal || false,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/75 px-3 pb-24 pt-6 sm:items-center sm:px-4 sm:pb-6 sm:backdrop-blur-sm">
      <div className="edit-log-sheet max-h-[calc(100dvh-8rem)] w-full max-w-md overflow-y-auto rounded-3xl border p-5 sm:max-h-[calc(100dvh-3rem)]" style={{ background: "linear-gradient(165deg, rgba(18,28,23,0.94), rgba(10,16,13,0.96))", borderColor: "rgba(255,255,255,0.14)", boxShadow: "0 24px 80px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(255,255,255,0.04)", backdropFilter: "blur(20px)" }}>
        <style>{`
          .edit-log-sheet input,
          .edit-log-sheet select,
          .edit-log-sheet textarea {
            font-size: 16px;
          }
        `}</style>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border text-white/70 transition hover:text-white" style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))", borderColor: "rgba(255,255,255,0.14)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {log.type === "insulin" && (
            <>
              <SelectField
                label="Insulin type"
                value={form.insulin_type}
                onChange={(value) => updateField("insulin_type", value)}
                options={insulinTypeOptions}
                placeholder="Insulin type"
              />
              <div className="grid grid-cols-1 gap-2">
                <NumberPadField label="Total" value={form.units} onChange={(value) => updateField("units", value)} />
                <NumberPadField label="Meal" value={form.meal_units} onChange={(value) => updateField("meal_units", value)} />
                <NumberPadField label="Correction" value={form.correction_units} onChange={(value) => updateField("correction_units", value)} />
              </div>
            </>
          )}

          {log.type === "glucose" && (
            <NumberPadField label="Glucose" value={form.value} onChange={(value) => updateField("value", value.replace(/\D/g, "").slice(0, 3))} decimal={false} maxLength={3} />
          )}

          {log.type === "carbs" && (
            <>
              <TextPadField label="Food" value={form.food_name} onChange={(value) => updateField("food_name", value)} placeholder="Food" />
              <div className="grid grid-cols-2 gap-2">
                <NumberPadField label="Carbs" value={form.carbs} onChange={(value) => updateField("carbs", value)} />
                <SelectField
                  label="Absorption"
                  value={form.absorption_profile}
                  onChange={(value) => updateField("absorption_profile", value)}
                  options={absorptionProfileOptions}
                />
              </div>
              <HighProteinFatCheckbox
                checked={form.is_high_protein_fat_meal}
                onChange={(checked) => updateField("is_high_protein_fat_meal", checked)}
              />
            </>
          )}

          <DateScrollField label="Date" value={form.date} onChange={(value) => updateField("date", value)} max={todayDateValue} />
          <TimeScrollField label="Logged at" value={form.time} onChange={(value) => updateField("time", value)} max={form.date === todayDateValue ? nowTimeString : undefined} />
          <TextPadField label="Notes" value={form.notes} onChange={(value) => updateField("notes", value)} placeholder="Notes" multiline />
          <button type="button" onClick={submit} disabled={isSaving} className="sticky bottom-0 w-full rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40" style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))", boxShadow: "0 8px 28px rgba(91,163,184,0.22), 0 -8px 20px rgba(10,18,16,0.9), inset 0 1px 1px rgba(255,255,255,0.2)" }}>
            {isSaving ? "Saving..." : "Save moment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function History() {
  const queryClient = useQueryClient();
  const { connected: dexcomConnected } = useDexcomConnection();
  const [level, setLevel] = useState("month"); // month | week | day | timeline
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [targetRange, setTargetRange] = useState(readTargetRange);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const updateTargetRange = () => setTargetRange(readTargetRange());

    window.addEventListener("target-range-updated", updateTargetRange);
    window.addEventListener("storage", updateTargetRange);

    return () => {
      window.removeEventListener("target-range-updated", updateTargetRange);
      window.removeEventListener("storage", updateTargetRange);
    };
  }, []);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["history-summary"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getHistorySummary", {
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const allDays = summary?.days || [];
  const targetLow = summary?.targetLow ?? targetRange.low;
  const targetHigh = summary?.targetHigh ?? targetRange.high;

  const months = useMemo(() => groupDaysByMonth(allDays), [allDays]);
  const currentMonth = useMemo(() => months.find((m) => m.key === selectedMonth) || null, [months, selectedMonth]);
  const weeks = useMemo(() => (currentMonth ? groupDaysByWeek(currentMonth.days) : []), [currentMonth]);
  const currentWeek = useMemo(() => weeks.find((w) => w.key === selectedWeek) || null, [weeks, selectedWeek]);
  const weekDays = useMemo(
    () => (currentWeek ? [...currentWeek.days].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [currentWeek]
  );

  const { data: dayLogs = [], isLoading: loadingDayLogs } = useQuery({
    queryKey: ["history-day-logs", selectedDay],
    queryFn: async () => {
      const start = new Date(`${selectedDay}T00:00:00`).toISOString();
      const end = new Date(`${selectedDay}T23:59:59`).toISOString();
      const [glucose, carbs, insulin] = await Promise.all([
        base44.entities.GlucoseReading.filter({ recorded_at: { $gte: start, $lte: end } }, "-recorded_at", 500),
        base44.entities.CarbEntry.filter({ consumed_at: { $gte: start, $lte: end } }, "-consumed_at", 500),
        base44.entities.InsulinDose.filter({ administered_at: { $gte: start, $lte: end } }, "-administered_at", 500),
      ]);
      const merged = [
        ...glucose.filter((g) => {
          if (g.source === "system") return false;
          if (dexcomConnected && (g.source === "dexcom" || g.source === "dexcom_share")) return false;
          return true;
        }).map((i) => ({ ...i, feedType: "glucose", timestamp: new Date(i.recorded_at).getTime() })),
        ...carbs.map((i) => ({ ...normalizeCarbEntry(i), feedType: "carbs", timestamp: new Date(i.consumed_at).getTime() })),
        ...insulin.map((i) => ({ ...i, feedType: "insulin", timestamp: new Date(i.administered_at).getTime() })),
      ].sort((a, b) => b.timestamp - a.timestamp);
      return merged;
    },
    enabled: level === "timeline" && !!selectedDay,
  });

  const invalidateHistory = () => {
    queryClient.invalidateQueries({ queryKey: ["history-summary"] });
    queryClient.invalidateQueries({ queryKey: ["history-day-logs"] });
  };

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      invalidateHistory();
      toast.success("Support gently removed");
      (async () => {
        if (await cleanupSplitPlansForDose(base44, deletedId)) {
          queryClient.invalidateQueries({ queryKey: ["split-plans"] });
        }
      })();
    },
    onError: () => toast.error("This moment has been preserved and can't be removed."),
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
      invalidateHistory();
      toast.success("Reading gently removed");
    },
    onError: () => toast.error("This moment has been preserved and can't be removed."),
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      invalidateHistory();
      toast.success("Nourishment removed");
      (async () => {
        if (await cancelSplitPlansForMeal(base44, deletedId)) {
          queryClient.invalidateQueries({ queryKey: ["split-plans"] });
        }
      })();
    },
    onError: () => toast.error("This moment has been preserved and can't be removed."),
  });

  const updateLog = useMutation({
    mutationFn: ({ type, id, patch }) => {
      if (type === "insulin") return base44.entities.InsulinDose.update(id, patch);
      if (type === "glucose") return base44.entities.GlucoseReading.update(id, patch);
      return base44.entities.CarbEntry.update(id, patch);
    },
    onSuccess: (updated, variables) => {
      const updatedItem = { ...editingLog?.item, ...variables.patch, ...updated, id: variables.id };

      if (variables.type === "insulin") {
        replaceCachedItem(queryClient, ["insulin-doses"], updatedItem);
        replaceCachedItem(queryClient, ["insulin-doses", "graph"], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
        queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      } else if (variables.type === "glucose") {
        replaceCachedItem(queryClient, ["latest-glucose"], updatedItem);
        replaceCachedItem(queryClient, ["glucose-readings"], updatedItem);
        replaceCachedItem(queryClient, ["glucose-readings", "graph"], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
        queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
        queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
      } else {
        replaceCachedItem(queryClient, ["carb-entries"], updatedItem);
        replaceCachedItem(queryClient, ["carb-entries", "graph"], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
        queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      }

      invalidateHistory();
      toast.success("Moment updated");
      setEditingLog(null);
    },
    onError: () => toast.error("Unable to update log. It may have been preserved."),
  });

  const handleSelectMonth = (key) => {
    setDirection(1);
    setSelectedMonth(key);
    setLevel("week");
  };

  const handleSelectWeek = (key) => {
    setDirection(1);
    setSelectedWeek(key);
    setLevel("day");
  };

  const handleSelectDay = (date) => {
    setDirection(1);
    setSelectedDay(date);
    setLevel("timeline");
  };

  const goBack = () => {
    setDirection(-1);
    if (level === "timeline") {
      setLevel("day");
      setSelectedDay(null);
    } else if (level === "day") {
      setLevel("week");
      setSelectedWeek(null);
    } else if (level === "week") {
      setLevel("month");
      setSelectedMonth(null);
    }
  };

  let headerTitle = "Your 90-Day Journey";
  let headerSub = "Reflecting on the last three months";
  if (level === "week" && currentMonth) {
    headerTitle = `${currentMonth.label} ${currentMonth.year}`;
    headerSub = trendSummary(currentMonth);
  } else if (level === "day" && currentWeek) {
    headerTitle = `Week of ${format(currentWeek.weekStart, "MMM d")}`;
    const ws = weekStats(currentWeek);
    headerSub = ws.glucoseAvg ? `${ws.glucoseAvg} mg/dL weekly average` : "No glucose moments this week";
  } else if (level === "timeline" && selectedDay) {
    headerTitle = format(parseISO(selectedDay), "EEEE, MMMM d");
    headerSub = `${dayLogs.length} ${dayLogs.length === 1 ? "moment" : "moments"}`;
  }

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EditLogSheet
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(payload) => updateLog.mutate(payload)}
        isSaving={updateLog.isPending}
      />

      <div className="flex items-center gap-3">
        {level !== "month" && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-white/70 transition hover:text-white"
            style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", borderColor: "rgba(255,255,255,0.14)" }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">{headerTitle}</h2>
          <p className="text-xs text-white/40">{headerSub}</p>
        </div>
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={level}
          custom={direction}
          initial={{ opacity: 0, x: direction > 0 ? 28 : -28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -28 : 28 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        >
          {level === "month" && (
            <HistoryMonthView months={months} onSelectMonth={handleSelectMonth} />
          )}

          {level === "week" && currentMonth && (
            <HistoryWeekView weeks={weeks} onSelectWeek={handleSelectWeek} />
          )}

          {level === "day" && currentWeek && (
            <HistoryDayView days={weekDays} onSelectDay={handleSelectDay} />
          )}

          {level === "timeline" && selectedDay && (
            <HistoryTimelineView
              logs={dayLogs}
              loading={loadingDayLogs}
              dexcomConnected={dexcomConnected}
              onEdit={(payload) => setEditingLog(payload)}
              onDeleteDose={(id) => deleteDose.mutate(id)}
              onDeleteGlucose={(id) => deleteGlucose.mutate(id)}
              onDeleteCarb={(id) => deleteCarb.mutate(id)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}