import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ActivityGraph from "../components/ActivityGraph";
import ActiveInsulinBanner from "../components/ActiveInsulinBanner";
import ActiveAlerts from "../components/ActiveAlerts";
import DoseForm from "../components/DoseForm";
import DoseCard from "../components/DoseCard";
import GlucoseCard from "../components/GlucoseCard";
import CarbCard from "../components/CarbCard";
import { getDoseStatus, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Activity, Plus, AlertTriangle, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { TimeScrollField, NumberPadField, TextPadField, SelectField } from "@/components/FormInputFields";

const FRESH_DATA_MS = 60 * 1000;
const GRAPH_DATA_MS = 5 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
const LATEST_GLUCOSE_CACHE_KEY = "latest_glucose_cache";

function readCachedLatestGlucose() {
  if (typeof window === "undefined") return [];

  try {
    const cached = window.localStorage.getItem(LATEST_GLUCOSE_CACHE_KEY);
    return cached ? [JSON.parse(cached)] : [];
  } catch {
    return [];
  }
}

function writeCachedLatestGlucose(reading) {
  if (typeof window === "undefined" || !reading) return;

  try {
    window.localStorage.setItem(LATEST_GLUCOSE_CACHE_KEY, JSON.stringify(reading));
    window.dispatchEvent(new Event("latest-glucose-updated"));
  } catch {
    // Ignore storage failures; the live query still owns the source of truth.
  }
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
  const title = log.type === "insulin" ? "Edit Insulin" : log.type === "glucose" ? "Edit Glucose" : "Edit Nourishment";

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

          <TimeScrollField label="Time" value={form.time} onChange={(value) => updateField("time", value)} />
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

function FloatingDoseLogger() {
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const preload = () => setDoseFormPreloaded(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }

    const id = window.setTimeout(preload, 350);
    return () => window.clearTimeout(id);
  }, []);

  const openDoseForm = () => {
    if (doseFormOpen) return;
    setDoseFormPreloaded(true);
    setDoseFormOpen(true);
  };

  return (
    <>
      {(doseFormPreloaded || doseFormOpen) && <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} />}
      {!doseFormOpen && (
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            openDoseForm();
          }}
          onClick={openDoseForm}
          className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border transition active:scale-95 backdrop-blur-sm"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.24), rgba(255,255,255,0.08))",
            borderColor: "rgba(255,255,255,0.28)",
            boxShadow: "0 18px 48px rgba(0,0,0,0.34), inset 0 1px 1px rgba(255,255,255,0.42), inset 0 -1px 1px rgba(255,255,255,0.1)",
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-5 opacity-80"
            style={{
              background: "radial-gradient(circle at 28% 0%, rgba(255,255,255,0.34), transparent 38%), radial-gradient(circle at 80% 120%, rgba(45,212,191,0.22), transparent 44%)",
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-1 rounded-full"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))",
              boxShadow: "inset 0 1px 1px rgba(255,255,255,0.22)",
            }}
          />
          <Plus className="relative z-10 h-7 w-7 text-white/85 drop-shadow-sm" />
        </button>
      )}
    </>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const stackingAlertsEnabled = localStorage.getItem("stacking_alerts_enabled") !== "false";

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setShowGraph(true), 120);
    return () => clearTimeout(id);
  }, []);

  const { data: doses = [], isLoading: loadingDoses } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 100),
    staleTime: FRESH_DATA_MS,
    gcTime: GRAPH_DATA_MS,
  });

  const { data: latestGlucoseRows = [], isLoading: loadingLatestGlucose } = useQuery({
    queryKey: ["latest-glucose"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 1),
    staleTime: 30 * 1000,
    gcTime: GRAPH_DATA_MS,
    initialData: readCachedLatestGlucose,
    placeholderData: () => queryClient.getQueryData(["glucose-readings", "graph"])?.slice(0, 1) ?? [],
  });

  useEffect(() => {
    writeCachedLatestGlucose(latestGlucoseRows[0]);
  }, [latestGlucoseRows]);

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ["glucose-readings", "graph"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 5000),
    staleTime: GRAPH_DATA_MS,
    gcTime: 30 * 60 * 1000,
    placeholderData: () => queryClient.getQueryData(["glucose-readings", "graph"]) ?? latestGlucoseRows,
  });

  const { data: carbEntries = [], isLoading: loadingCarbs } = useQuery({
    queryKey: ["carb-entries"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 100),
    staleTime: FRESH_DATA_MS,
    gcTime: GRAPH_DATA_MS,
  });

  const { data: graphCarbsSource = [] } = useQuery({
    queryKey: ["carb-entries", "graph"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 1000),
    staleTime: GRAPH_DATA_MS,
    gcTime: 30 * 60 * 1000,
    placeholderData: () => queryClient.getQueryData(["carb-entries", "graph"]) ?? carbEntries,
  });

  const { data: graphDosesSource = [] } = useQuery({
    queryKey: ["insulin-doses", "graph"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 1000),
    staleTime: GRAPH_DATA_MS,
    gcTime: 30 * 60 * 1000,
    placeholderData: () => queryClient.getQueryData(["insulin-doses", "graph"]) ?? doses,
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
      toast.success("Reading gently removed");
    },
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      toast.success("Nourishment removed");
    },
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      toast.success("Support removed");
    },
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
        const latest = queryClient.getQueryData(["latest-glucose"])?.[0];
        if (latest?.id === updatedItem.id) writeCachedLatestGlucose(updatedItem);
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

  const recentDoses = doses.filter((dose) => {
    const age = Date.now() - new Date(dose.administered_at).getTime();
    return age < TWO_DAYS_MS;
  });

  const heroGlucoseReadings = glucoseReadings.length ? glucoseReadings : latestGlucoseRows;

  const recentGlucose = heroGlucoseReadings.filter((reading) => {
    const age = Date.now() - new Date(reading.recorded_at).getTime();
    return age < ONE_DAY_MS;
  });

  const recentCarbs = carbEntries.filter((entry) => {
    const age = Date.now() - new Date(entry.consumed_at).getTime();
    return age < ONE_DAY_MS;
  });

  const graphGlucose = glucoseReadings.filter((reading) => {
    const age = Date.now() - new Date(reading.recorded_at).getTime();
    return age < FOURTEEN_DAYS_MS;
  });

  const graphDoses = graphDosesSource.filter((dose) => {
    const age = Date.now() - new Date(dose.administered_at).getTime();
    return age < FOURTEEN_DAYS_MS;
  });

  const graphCarbs = graphCarbsSource.filter((entry) => {
    const age = Date.now() - new Date(entry.consumed_at).getTime();
    return age < FOURTEEN_DAYS_MS;
  });

  const latestGlucose = latestGlucoseRows[0] || glucoseReadings[0] || null;

  const activeRapidCount = useMemo(() => {
    const activeDoses = recentDoses
      .map((dose) => ({ dose, status: getDoseStatus(dose) }))
      .filter((item) => item.status.phase !== "expired");

    return activeDoses.filter(
      (item) =>
        ["rising", "near_peak", "peak", "declining", "low_activity"].includes(item.status.phase) &&
        ["Rapid-Acting", "Short-Acting"].includes(INSULIN_PROFILES[item.dose.insulin_type]?.category),
    ).length;
  }, [recentDoses]);

  const recentActivity = useMemo(() => {
    const doseLogs = recentDoses.map((dose) => ({
      ...dose,
      feedType: "insulin",
      timestamp: new Date(dose.administered_at).getTime(),
    }));
    const glucoseLogs = recentGlucose.map((reading) => ({
      ...reading,
      feedType: "glucose",
      timestamp: new Date(reading.recorded_at).getTime(),
    }));
    const carbLogs = recentCarbs.map((entry) => ({
      ...entry,
      feedType: "carbs",
      timestamp: new Date(entry.consumed_at).getTime(),
    }));

    return [...doseLogs, ...glucoseLogs, ...carbLogs].sort((a, b) => b.timestamp - a.timestamp);
  }, [recentDoses, recentGlucose, recentCarbs]);

  const shouldShowEmptyState =
    !loadingDoses &&
    !loadingLatestGlucose &&
    !loadingCarbs &&
    recentDoses.length === 0 &&
    recentGlucose.length === 0 &&
    recentCarbs.length === 0;

  return (
    <div className="dashboard-page w-full max-w-full min-w-0 space-y-0 overflow-visible">
      <EditLogSheet
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(payload) => updateLog.mutate(payload)}
        isSaving={updateLog.isPending}
      />

      {shouldShowEmptyState ? (
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <Activity className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold text-white">Ready to begin</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Log your first dose to see its gentle activity curve unfold on your timeline.
          </p>
        </div>
      ) : (
        <>
          <div className="w-full max-w-full min-w-0 overflow-x-hidden">
            <ActiveInsulinBanner
              doses={recentDoses}
              latestGlucose={latestGlucose}
              glucoseReadings={heroGlucoseReadings}
              carbEntries={recentCarbs}
            />
          </div>

          {stackingAlertsEnabled && activeRapidCount > 1 && (
            <div className="dashboard-stacking-alert backdrop-blur-sm mx-0 flex w-full max-w-full min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-white/10 p-4 pb-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Multiple Active Doses</p>
                <p className="mt-0.5 text-sm opacity-80">
                  {activeRapidCount} rapid-acting doses are active at once. Keep a gentle eye on how you're feeling.
                </p>
              </div>
            </div>
          )}

          <div className="mb-2 w-full max-w-full min-w-0">
            <p className="mb-2 px-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              Glucose Journey
            </p>
            {showGraph ? (
              <ActivityGraph doses={graphDoses} glucoseReadings={graphGlucose} carbEntries={graphCarbs} />
            ) : (
              <div className="h-[320px] w-full" />
            )}
          </div>

          <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-6 overflow-x-hidden border-0 px-0 py-4 lg:grid-cols-3">
            <div className="min-w-0 max-w-full space-y-2 overflow-x-hidden lg:col-span-2">
              <p className="mx-4 mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                Recent Moments
              </p>
              <div className="w-full max-w-full min-w-0 space-y-2 overflow-x-hidden">
                {(showAllDoses ? recentActivity.slice(0, 15) : recentActivity.slice(0, 5)).map((item) =>
                  item.feedType === "insulin" ? (
                    <EditableLog key={`dose-${item.id}`} onEdit={() => setEditingLog({ type: "insulin", item })}>
                      <DoseCard dose={item} onDelete={(id) => deleteDose.mutate(id)} />
                    </EditableLog>
                  ) : item.feedType === "carbs" ? (
                    <EditableLog key={`carb-${item.id}`} onEdit={() => setEditingLog({ type: "carbs", item })}>
                      <CarbCard entry={item} onDelete={(id) => deleteCarb.mutate(id)} />
                    </EditableLog>
                  ) : (
                    <EditableLog key={`glucose-${item.id}`} onEdit={() => setEditingLog({ type: "glucose", item })}>
                      <GlucoseCard reading={item} onDelete={(id) => deleteGlucose.mutate(id)} />
                    </EditableLog>
                  ),
                )}
              </div>
              {recentActivity.length > 5 && (
                <button
                  onClick={() => setShowAllDoses((value) => !value)}
                  className="mx-4 mt-1 hidden text-sm font-medium text-[hsl(var(--muted-foreground))] hover:underline"
                >
                  {showAllDoses ? "Show less" : `Show more (${Math.min(recentActivity.length, 10) - 5} more)`}
                </button>
              )}
            </div>

            <div className="min-w-0 max-w-full overflow-x-hidden">
              <ActiveAlerts doses={recentDoses} />
            </div>
          </div>
        </>
      )}

      <FloatingDoseLogger />
    </div>
  );
}