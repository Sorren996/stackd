import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ActivityGraph from "../components/ActivityGraph";
import ActiveInsulinBanner from "../components/ActiveInsulinBanner";
import FloatingActionMenu from "@/components/FloatingActionMenu";
import SplitPlanCard from "@/components/splitdose/SplitPlanCard";
import { isActivePlan, cancelSplitPlansForMeal, cleanupSplitPlansForDose } from "@/lib/splitDoseUtils";
import DoseCard from "../components/DoseCard";
import GlucoseCard from "../components/GlucoseCard";
import CarbCard from "../components/CarbCard";
import { getDoseStatus, getInsulinCategory, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Activity, AlertTriangle, X, Pencil } from "lucide-react";
import HighProteinFatCheckbox from "@/components/HighProteinFatCheckbox";
import { toast } from "sonner";
import { getVersionString } from "@/lib/appVersion";
import { DateScrollField, TimeScrollField, NumberPadField, TextPadField, SelectField } from "@/components/FormInputFields";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useVisibilityRefresh } from "@/hooks/useVisibilityRefresh";
import DexcomSyncStatus from "@/components/DexcomSyncStatus";
import ConnectGlucoseSourcePrompt from "@/components/ConnectGlucoseSourcePrompt";

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
  const title = log.type === "insulin" ? "Edit Insulin" : log.type === "glucose" ? "Edit Glucose" : "Edit Nourishment";

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
          <TimeScrollField label="Time" value={form.time} onChange={(value) => updateField("time", value)} max={form.date === todayDateValue ? nowTimeString : undefined} />
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

export default function Dashboard() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isDashboardActive = location.pathname === "/";
  const [, setTick] = useState(0);
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const { connected: dexcomConnected, isLoading: dexcomLoading, connection: dexcomConnection } = useDexcomConnection();
  useVisibilityRefresh();
  const stackingAlertsEnabled = localStorage.getItem("stacking_alerts_enabled") !== "false";

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setShowGraph(true), 120);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!showGraph) return;
    // The graph slot has committed — let two frames paint before dismissing
    // the splash so the user never sees the graph pop in.
    const rafId = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.dispatchEvent(new CustomEvent("dashboard-graph-ready"))
      )
    );
    return () => cancelAnimationFrame(rafId);
  }, [showGraph]);

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
    refetchInterval: dexcomConnected ? 60_000 : false,
    gcTime: GRAPH_DATA_MS,
    initialData: readCachedLatestGlucose,
    placeholderData: () => queryClient.getQueryData(["glucose-readings", "graph"])?.slice(0, 1) ?? [],
  });

  useEffect(() => {
    writeCachedLatestGlucose(latestGlucoseRows[0]);
  }, [latestGlucoseRows]);

  // When the latest-glucose query picks up a newer reading before the graph
  // query's next refetch, inject it into the graph cache so the ActivityGraph
  // displays the freshest value immediately — no stale flicker.
  // Only depends on latestGlucoseRows (not glucoseReadings) to avoid a
  // feedback loop: setQueryData changes glucoseReadings which would retrigger
  // this effect.
  useEffect(() => {
    if (!latestGlucoseRows.length) return;
    const latest = latestGlucoseRows[0];
    if (!latest?.recorded_at) return;
    const graphData = queryClient.getQueryData(["glucose-readings", "graph"]) ?? [];
    if (!graphData.length) return;
    const graphLatest = graphData[0];
    if (!graphLatest?.recorded_at) return;
    if (new Date(latest.recorded_at).getTime() <= new Date(graphLatest.recorded_at).getTime()) return;
    queryClient.setQueryData(["glucose-readings", "graph"], (old = []) => [latest, ...old]);
  }, [latestGlucoseRows, queryClient]);

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ["glucose-readings", "graph"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 5000),
    staleTime: GRAPH_DATA_MS,
    refetchInterval: dexcomConnected ? 120_000 : false,
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

  // On-demand Dexcom Share sync — when the user is actively viewing the
  // Dashboard, trigger an immediate Share fetch every 2 minutes instead of
  // waiting up to 5 minutes for the scheduled pass. The function rate-limits
  // itself (2 min per connection) so this stays light on the Dexcom API.
  const { data: pollResult } = useQuery({
    queryKey: ["dexcom-poll-now"],
    queryFn: async () => {
      const res = await base44.functions.invoke("pollDexcomNow", {});
      return res.data;
    },
    enabled: dexcomConnected,
    refetchInterval: dexcomConnected ? 120_000 : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 30 * 1000,
  });

  // When the on-demand poll inserts new readings, invalidate the glucose
  // queries so the graph and latest-glucose card refresh immediately.
  useEffect(() => {
    if (pollResult?.records_inserted > 0) {
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
    }
  }, [pollResult, queryClient]);

  const { data: splitPlans = [] } = useQuery({
    queryKey: ["split-plans"],
    queryFn: () => base44.entities.SplitDosePlan.list("-created_date", 20),
    staleTime: FRESH_DATA_MS,
    gcTime: GRAPH_DATA_MS,
  });

  const activeSplitPlans = useMemo(
    () => splitPlans.filter((p) => isActivePlan(p)),
    [splitPlans]
  );

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
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      toast.success("Nourishment removed");
      (async () => {
        if (await cancelSplitPlansForMeal(base44, deletedId)) {
          queryClient.invalidateQueries({ queryKey: ["split-plans"] });
        }
      })();
    },
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      toast.success("Support removed");
      (async () => {
        if (await cleanupSplitPlansForDose(base44, deletedId)) {
          queryClient.invalidateQueries({ queryKey: ["split-plans"] });
        }
      })();
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

  const handleDeleteLog = (log) => {
    if (!log?.type || !log?.item?.id) return;
    if (log.type === "insulin") deleteDose.mutate(log.item.id);
    else if (log.type === "glucose") deleteGlucose.mutate(log.item.id);
    else deleteCarb.mutate(log.item.id);
  };

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
        ["Rapid-Acting", "Short-Acting"].includes(getInsulinCategory(item.dose.insulin_type)),
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
    <div className="dashboard-page relative w-full max-w-full min-w-0 space-y-0 overflow-visible">
      <EditLogSheet
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(payload) => updateLog.mutate(payload)}
        isSaving={updateLog.isPending}
      />

      <div className="mb-4 space-y-3">
        <DexcomSyncStatus />
        {!dexcomConnected && !dexcomLoading && (
          <ConnectGlucoseSourcePrompt connection={dexcomConnection} />
        )}
      </div>

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
          <div className="relative w-full max-w-full min-w-0">
            <ActiveInsulinBanner
              doses={recentDoses}
              latestGlucose={latestGlucose}
              glucoseReadings={heroGlucoseReadings}
              carbEntries={recentCarbs}
              graphSlot={
                showGraph && isDashboardActive ? (
                  <ActivityGraph
                    doses={graphDoses}
                    glucoseReadings={graphGlucose}
                    carbEntries={graphCarbs}
                    onSelectLog={setEditingLog}
                    onDeleteLog={handleDeleteLog}
                    glucoseReadOnly={dexcomConnected}
                  />
                ) : (
                  <div className="h-[320px] w-full" />
                )
              }
              onEditGlucose={dexcomConnected ? null : (reading) => setEditingLog({ type: "glucose", item: reading })}
            />
          </div>

          {activeSplitPlans.length > 0 && (
            <div className="mt-4 space-y-2">
              {activeSplitPlans.slice(0, 3).map((plan) => (
                <SplitPlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          )}


        </>
      )}

      <FloatingActionMenu />

      <div className="flex w-full justify-center pt-8 pb-4">
        <span className="text-[10px] font-medium tracking-wide text-white/20">
          {getVersionString()}
        </span>
      </div>
    </div>
  );
}