import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ActivityGraph from "../components/ActivityGraph";
import ActiveInsulinBanner from "../components/ActiveInsulinBanner";
import SplitPlanCard from "@/components/splitdose/SplitPlanCard";
import { isActivePlan, cancelSplitPlansForMeal, cleanupSplitPlansForDose } from "@/lib/splitDoseUtils";
import DoseCard from "../components/DoseCard";
import GlucoseCard from "../components/GlucoseCard";
import CarbCard from "../components/CarbCard";
import { getDoseStatus, getInsulinCategory } from "@/lib/insulinPharmacology";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import EditLogSheet from "@/components/edit/EditLogSheet";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useVisibilityRefresh } from "@/hooks/useVisibilityRefresh";
import { useDexcomRefresh } from "@/hooks/useDexcomRefresh";
import { useLatestProjection } from "@/hooks/useLatestProjection";
import DexcomSyncStatus from "@/components/DexcomSyncStatus";
import ConnectGlucoseSourcePrompt from "@/components/ConnectGlucoseSourcePrompt";
import SensorSessionBanner from "@/components/SensorSessionBanner";
import PageHeader from "@/components/editorial/PageHeader";
import AmbientInscription from "@/components/dashboard/AmbientInscription";

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

function replaceCachedItem(queryClient, queryKey, updatedItem) {
  queryClient.setQueryData(queryKey, (current = []) =>
    Array.isArray(current) ? current.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item)) : current
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const { connected: dexcomConnected, isLoading: dexcomLoading, connection: dexcomConnection } = useDexcomConnection();
  useVisibilityRefresh();
  const { requestRefresh } = useDexcomRefresh();
  const stackingAlertsEnabled = localStorage.getItem("stacking_alerts_enabled") !== "false";

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
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
    refetchInterval: dexcomConnected ? 60_000 : false,
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
    refetchInterval: dexcomConnected ? 120_000 : false,
    gcTime: 30 * 60 * 1000,
    placeholderData: () => queryClient.getQueryData(["glucose-readings", "graph"]) ?? latestGlucoseRows,
  });

  // ── Single source of truth for glucose display ──────────────────────────
  // The latest-glucose query refetches every 60s; the graph query every 120s.
  // Merge the latest reading into the graph data on every render so the Daily
  // Flow graph and the Current Glucose card always derive from the same
  // freshest source. This replaces the old cache-injection effect, which was
  // fragile: a graph refetch could overwrite the injected reading with stale
  // server data, and the effect wouldn't re-run to re-inject it.
  const mergedGraphReadings = useMemo(() => {
    if (!latestGlucoseRows.length) return glucoseReadings;
    const latest = latestGlucoseRows[0];
    if (!latest?.recorded_at) return glucoseReadings;
    const latestTime = new Date(latest.recorded_at).getTime();
    const graphLatest = glucoseReadings[0];
    const graphLatestTime = graphLatest ? new Date(graphLatest.recorded_at).getTime() : -Infinity;
    if (latestTime > graphLatestTime && !glucoseReadings.some((r) => r.id === latest.id)) {
      return [latest, ...glucoseReadings];
    }
    return glucoseReadings;
  }, [glucoseReadings, latestGlucoseRows]);

  const { data: carbEntries = [], isLoading: loadingCarbs } = useQuery({
    queryKey: ["carb-entries"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 100),
    staleTime: FRESH_DATA_MS,
    gcTime: GRAPH_DATA_MS,
  });

  // ── Continuous-learning projection ─────────────────────────────────────
  // The projection re-anchors on every new glucose reading and refreshes its
  // active inputs on every new meal/insulin log. The latest timestamps act
  // as signals: when any changes, the hook triggers a background generation
  // through the existing insight-engine pipeline and refetches promptly so
  // the rendered cone reflects the latest reading and latest logged support.
  const projection = useLatestProjection({
    latestReadingTime: latestGlucoseRows[0]?.recorded_at || null,
    latestMealTime: carbEntries[0]?.consumed_at || null,
    latestDoseTime: doses[0]?.administered_at || null,
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

  // ── Cadence-aware Dexcom refresh ──────────────────────────
  // The Dashboard periodically asks the centralized gate whether a new
  // reading is likely available. The gate (pollDexcomNow →
  // requestDexcomRefreshIfNeeded) checks the newest reading timestamp
  // and skips the API call when the cached reading is still within the
  // expected G7 cadence + propagation grace. This lets us check
  // frequently (every 60s) without hammering the Share API.
  //
  // The singleton promise in useDexcomRefresh collapses simultaneous
  // triggers (periodic timer, foreground, manual refresh) into one call.
  useEffect(() => {
    if (!dexcomConnected) return undefined;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await requestRefresh(false);
        // Surface real errors (not skips or rate-limit noise).
        if (result?.status === "error") {
          const reason = String(result?.error || "");
          if (!/rate limit/i.test(reason)) {
            toast.error(`Refresh unsuccessful: ${reason || "Unknown error"}`);
          }
        }
      } catch {
        // Non-fatal — the next opportunity will try again.
      }
    };

    // Initial check on mount / when connection becomes active.
    poll();

    // Periodic check — the backend gate prevents unnecessary API calls.
    const intervalId = setInterval(poll, 60_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [dexcomConnected, requestRefresh]);

  // Foreground refresh — when the PWA returns to the foreground, check
  // for new readings immediately (the OS may have suspended the timer).
  useEffect(() => {
    if (!dexcomConnected) return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        requestRefresh(false).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [dexcomConnected, requestRefresh]);

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

  const heroGlucoseReadings = mergedGraphReadings.length ? mergedGraphReadings : latestGlucoseRows;

  const recentGlucose = heroGlucoseReadings.filter((reading) => {
    const age = Date.now() - new Date(reading.recorded_at).getTime();
    return age < ONE_DAY_MS;
  });

  const recentCarbs = carbEntries.filter((entry) => {
    const age = Date.now() - new Date(entry.consumed_at).getTime();
    return age < ONE_DAY_MS;
  });

  const graphGlucose = mergedGraphReadings.filter((reading) => {
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
    <div className="dashboard-page relative w-full max-w-full min-w-0 space-y-0 overflow-x-hidden">
      <EditLogSheet
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(payload) => updateLog.mutate(payload)}
        isSaving={updateLog.isPending}
      />

      <SensorSessionBanner />

      <div className="mb-4">
        <DexcomSyncStatus />
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
              connectBanner={!dexcomConnected && !dexcomLoading ? (
                <ConnectGlucoseSourcePrompt connection={dexcomConnection} />
              ) : null}
              graphSlot={
                <ActivityGraph
                  doses={graphDoses}
                  glucoseReadings={graphGlucose}
                  carbEntries={graphCarbs}
                  onSelectLog={setEditingLog}
                  onDeleteLog={handleDeleteLog}
                  glucoseReadOnly={dexcomConnected}
                  projection={projection}
                />
              }
              onEditGlucose={dexcomConnected ? null : (reading) => setEditingLog({ type: "glucose", item: reading })}
              onEditDose={(log) => setEditingLog(log)}
              onDeleteDose={handleDeleteLog}
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

      <AmbientInscription />
    </div>
  );
}