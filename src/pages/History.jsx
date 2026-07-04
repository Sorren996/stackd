import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import DoseCard from "@/components/DoseCard";
import GlucoseCard from "@/components/GlucoseCard";
import CarbCard from "@/components/CarbCard";
import { toast } from "sonner";
import { CalendarDays, X, Pencil } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { TimeScrollField, NumberPadField, TextPadField, SelectField } from "@/components/FormInputFields";
import TimelineDayGroup from "@/components/history/TimelineDayGroup";
import { GLASS_SURFACE } from "@/lib/glassTheme";

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
}

function getDoseDaySummary(items) {
  const total = items.reduce((sum, d) => sum + Number(d.units || 0), 0);
  return `${total % 1 === 0 ? total : total.toFixed(1)}u of support`;
}

function getGlucoseDaySummary(items, targetLow, targetHigh) {
  if (!items.length) return null;
  const avg = Math.round(items.reduce((s, r) => s + Number(r.value), 0) / items.length);
  const inRange = items.filter((r) => r.value >= targetLow && r.value <= targetHigh).length;
  const pct = Math.round((inRange / items.length) * 100);
  return `${avg} mg/dL avg · ${pct}% in comfort zone`;
}

function getCarbDaySummary(items) {
  const total = items.reduce((sum, e) => sum + Number(e.carbs || 0), 0);
  return `${Math.round(total)}g of nourishment`;
}

function groupByDate(items, dateField) {
  const groups = {};
  items.forEach((item) => {
    const timestamp = item[dateField];
    if (!timestamp) return;

    const parsed = parseISO(timestamp);
    if (Number.isNaN(parsed.getTime())) return;

    const date = format(parsed, "yyyy-MM-dd");
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const d = parseISO(date);
      let label = format(d, "EEEE, MMMM d");
      if (isToday(d)) label = "Today";
      else if (isYesterday(d)) label = "Yesterday";
      return { date, label, items };
    });
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

function mergeTime(originalTimestamp, timeValue) {
  const date = originalTimestamp ? new Date(originalTimestamp) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const [hours, minutes] = timeValue.split(":").map(Number);
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
      time: toTimeValue(log.item.administered_at),
      notes: log.item.notes || "",
    };
  }
  if (log.type === "glucose") {
    return {
      value: String(log.item.value ?? ""),
      time: toTimeValue(log.item.recorded_at),
      notes: log.item.notes || "",
    };
  }
  return {
    food_name: log.item.food_name || log.item.name || "",
    carbs: String(log.item.carbs ?? ""),
    absorption_profile: log.item.absorption_profile || log.item.profile || "medium",
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
      const administeredAt = mergeTime(log.item.administered_at, form.time);
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
      const recordedAt = mergeTime(log.item.recorded_at, form.time);
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
    const consumedAt = mergeTime(log.item.consumed_at, form.time);
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
            </>
          )}

          <TimeScrollField label="Logged at" value={form.time} onChange={(value) => updateField("time", value)} />
          <TextPadField label="Notes" value={form.notes} onChange={(value) => updateField("notes", value)} placeholder="Notes" multiline />
          <button type="button" onClick={submit} disabled={isSaving} className="sticky bottom-0 w-full rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40" style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))", boxShadow: "0 8px 28px rgba(91,163,184,0.22), 0 -8px 20px rgba(10,18,16,0.9), inset 0 1px 1px rgba(255,255,255,0.2)" }}>
            {isSaving ? "Saving..." : "Save moment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableLog({ children, onEdit }) {
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit log"
        className="absolute right-12 top-4 flex h-7 w-7 items-center justify-center rounded-full border text-white/55 transition hover:text-white"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", borderColor: "rgba(255,255,255,0.12)" }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function History() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("doses");
  const [openGroup, setOpenGroup] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [targetRange, setTargetRange] = useState(readTargetRange);

  useEffect(() => {
    const updateTargetRange = () => setTargetRange(readTargetRange());

    window.addEventListener("target-range-updated", updateTargetRange);
    window.addEventListener("storage", updateTargetRange);

    return () => {
      window.removeEventListener("target-range-updated", updateTargetRange);
      window.removeEventListener("storage", updateTargetRange);
    };
  }, []);

  const { data: doses = [], isLoading: loadingDoses } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 200)
  });

  const { data: glucoseReadings = [], isLoading: loadingGlucose } = useQuery({
    queryKey: ["glucose-readings"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 1000)
  });

  const { data: carbEntries = [], isLoading: loadingCarbs } = useQuery({
    queryKey: ["carb-entries"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 300)
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Support gently removed");
    }
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Reading gently removed");
    }
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      toast.success("Nourishment removed");
    }
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

      toast.success("Moment updated");
      setEditingLog(null);
    },
    onError: () => toast.error("Unable to update log. Please try again."),
  });

  const normalizedCarbEntries = useMemo(
    () => carbEntries.map(normalizeCarbEntry).filter((entry) => entry.consumed_at && entry.carbs > 0),
    [carbEntries]
  );

  const doseGroups = groupByDate(doses, "administered_at");
  const carbGroups = groupByDate(normalizedCarbEntries, "consumed_at");

  const getCarbAverage = (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = normalizedCarbEntries.filter((e) => new Date(e.consumed_at).getTime() >= cutoff);
    if (!filtered.length) return "—";
    const totalDays = Math.max(1, Math.ceil((Date.now() - Math.min(...filtered.map(e => new Date(e.consumed_at).getTime()))) / (24*60*60*1000)) || days);
    const sum = filtered.reduce((acc, e) => acc + e.carbs, 0);
    return `${Math.round(sum / Math.min(days, totalDays))}`;
  };

  const totalCarbsLast30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return normalizedCarbEntries.filter(e => new Date(e.consumed_at).getTime() >= cutoff).reduce((acc, e) => acc + e.carbs, 0);
  }, [normalizedCarbEntries]);

  const glucose30Days = glucoseReadings.filter((r) => {
    return Date.now() - new Date(r.recorded_at).getTime() <= 30 * 24 * 60 * 60 * 1000;
  });
  const glucoseGroups = groupByDate(glucose30Days, "recorded_at");

  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;

  const inRangePercentage = useMemo(() => {
    if (!glucoseReadings.length) return "—";
    const inRangeCount = glucoseReadings.filter(
      (r) => r.value >= targetLow && r.value <= targetHigh
    ).length;
    return `${Math.round((inRangeCount / glucoseReadings.length) * 100)}%`;
  }, [glucoseReadings, targetLow, targetHigh]);

  const getAverage = (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = glucoseReadings.filter((r) => new Date(r.recorded_at).getTime() >= cutoff);
    if (!filtered.length) return "—";
    const sum = filtered.reduce((acc, curr) => acc + curr.value, 0);
    return `${Math.round(sum / filtered.length)}`;
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setOpenGroup(null);
  };

  if (loadingDoses || loadingGlucose || loadingCarbs) {
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

      <div className="flex justify-center">
        <div
          className="flex items-center gap-1 p-1 rounded-3xl border border-white/10 shadow-lg backdrop-blur-sm"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.12)"
          }}>
          <button
            onClick={() => handleTabChange("doses")}
            className={`relative px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              activeTab === "doses" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}>
            {activeTab === "doses" && (
              <motion.div
                layoutId="active-history-tab"
                className="absolute inset-0 bg-white/10 rounded-2xl -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.8 }} />
            )}
            <span className="relative z-10">Support</span>
          </button>

          <button
            onClick={() => handleTabChange("glucose")}
            className={`relative px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              activeTab === "glucose" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}>
            {activeTab === "glucose" && (
              <motion.div
                layoutId="active-history-tab"
                className="absolute inset-0 bg-white/10 rounded-2xl -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.8 }} />
            )}
            <span className="relative z-10">Glucose</span>
          </button>

          <button
            onClick={() => handleTabChange("carbs")}
            className={`relative px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              activeTab === "carbs" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}>
            {activeTab === "carbs" && (
              <motion.div
                layoutId="active-history-tab"
                className="absolute inset-0 bg-white/10 rounded-2xl -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.8 }} />
            )}
            <span className="relative z-10">Nourishment</span>
          </button>
        </div>
      </div>

      {activeTab === "doses" && (
        <div className="space-y-6">
          {doseGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold text-white">Your journey is just beginning</h3>
              <p className="text-sm text-muted-foreground mt-1">Tap the + button to record your first moment of support.</p>
            </div>
          ) : (
            doseGroups.map((group) => (
              <TimelineDayGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                summary={getDoseDaySummary(group.items)}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((dose) => (
                  <EditableLog key={dose.id} onEdit={() => setEditingLog({ type: "insulin", item: dose })}>
                    <DoseCard dose={dose} onDelete={(id) => deleteDose.mutate(id)} />
                  </EditableLog>
                ))}
              </TimelineDayGroup>
            ))
          )}
        </div>
      )}

      {activeTab === "glucose" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "1 Day", days: 1 },
              { label: "3 Day", days: 3 },
              { label: "7 Day", days: 7 },
              { label: "14 Day", days: 14 },
              { label: "30 Day", days: 30 }
            ].map((window) => (
              <div key={window.label} className="backdrop-blur-sm border border-white/10 rounded-2xl p-3 text-center" style={GLASS_SURFACE}>
                <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">{window.label} Avg</p>
                <p className="text-xl text-white mt-1 font-extrabold text-center">{getAverage(window.days)}</p>
                <p className="text-[10px] text-white/30 mt-0.5">mg/dL</p>
              </div>
            ))}
            <div className="backdrop-blur-sm rounded-2xl p-3 text-center" style={{ ...GLASS_SURFACE, borderColor: "rgba(91,168,138,0.3)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#5ba88a" }}>In Comfort Zone</p>
              <p className="text-xl mt-1 font-extrabold text-center" style={{ color: "#5ba88a" }}>{inRangePercentage}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(91,168,138,0.6)" }}>{targetLow}–{targetHigh} mg/dL</p>
            </div>
          </div>

          {glucoseGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold text-white">No glucose moments in the last 30 days</h3>
              <p className="text-sm text-muted-foreground mt-1">Your glucose check-ins will gently appear here as you log them.</p>
            </div>
          ) : (
            glucoseGroups.map((group) => (
              <TimelineDayGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                summary={getGlucoseDaySummary(group.items, targetLow, targetHigh)}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((reading) => (
                  <EditableLog key={reading.id} onEdit={() => setEditingLog({ type: "glucose", item: reading })}>
                    <GlucoseCard reading={reading} onDelete={(id) => deleteGlucose.mutate(id)} />
                  </EditableLog>
                ))}
              </TimelineDayGroup>
            ))
          )}
        </div>
      )}

      {activeTab === "carbs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "1 Day Avg", days: 1 },
              { label: "7 Day Avg", days: 7 },
              { label: "14 Day Avg", days: 14 },
              { label: "30 Day Avg", days: 30 },
            ].map((window) => (
              <div key={window.label} className="backdrop-blur-sm border border-white/10 rounded-2xl p-3 text-center" style={GLASS_SURFACE}>
                <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">{window.label}</p>
                <p className="text-xl text-white mt-1 font-extrabold">{getCarbAverage(window.days)}</p>
                <p className="text-[10px] text-white/30 mt-0.5">g / day</p>
              </div>
            ))}
          </div>
          <div className="backdrop-blur-sm rounded-2xl p-3 text-center" style={GLASS_SURFACE}>
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Total Nourishment (30 Days)</p>
            <p className="text-2xl text-white mt-1 font-extrabold">{totalCarbsLast30}g</p>
          </div>

          {carbGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold text-white">No nourishment logged yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Your meals will appear here as you log them.</p>
            </div>
          ) : (
            carbGroups.map((group) => (
              <TimelineDayGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                summary={getCarbDaySummary(group.items)}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((entry) => (
                  <EditableLog key={entry.id} onEdit={() => setEditingLog({ type: "carbs", item: entry })}>
                    <CarbCard entry={entry} onDelete={(id) => deleteCarb.mutate(id)} />
                  </EditableLog>
                ))}
              </TimelineDayGroup>
            ))
          )}
        </div>
      )}
    </div>
  );
}