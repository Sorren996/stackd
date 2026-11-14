import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ActivityGraph from "../components/ActivityGraph";
import ActiveInsulinBanner from "../components/ActiveInsulinBanner";
import SplitPlanCard from "@/components/splitdose/SplitPlanCard";
import { isActivePlan, cancelSplitPlansForMeal, cleanupSplitPlansForDose } from "@/lib/splitDoseUtils";
import { getDoseStatus, getInsulinCategory } from "@/lib/insulinPharmacology";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import EditLogSheet from "@/components/edit/EditLogSheet";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import usePatientResumeSnapshot from "@/hooks/usePatientResumeSnapshot";
import { boundedRead } from "@/lib/resumeFreshness";
import { mergeReadingSeries } from "@/lib/glucoseSeries";
import { useAuth } from "@/lib/AuthContext";
import { useDexcomRefresh } from "@/hooks/useDexcomRefresh";
import { useLatestProjection } from "@/hooks/useLatestProjection";
import DexcomSyncStatus from "@/components/DexcomSyncStatus";
import ConnectGlucoseSourcePrompt from "@/components/ConnectGlucoseSourcePrompt";
import SensorSessionBanner from "@/components/SensorSessionBanner";
import AmbientInscription from "@/components/dashboard/AmbientInscription";
import {
  readCachedLatestGlucose,
  readCachedLatestGlucoseSavedAt,
  writeCachedLatestGlucose,
  clearCachedLatestGlucose,
} from "@/lib/latestGlucoseCache";
import { markProjectionInputsChanged } from "@/lib/projection/projectionStaleness";
const EMPTY = [];

const FRESH_DATA_MS = 60 * 1000;
const GRAPH_DATA_MS = 5 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
// The Home chart's window: the last 24 hours plus a 2 hour margin, so the left
// edge still holds real readings after an overnight pan. Older days stay on the
// Journal's day view, which keeps its own queries.
const GRAPH_WINDOW_MS = 26 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

function replaceCachedItem(queryClient, queryKey, updatedItem) {
  queryClient.setQueryData(queryKey, (current = []) =>
    Array.isArray(current) ? current.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item)) : current
  );
}

// A removed reading has to leave the cache, not just be refetched. The chart's
// query folds a response into what is already on screen and refuses a response
// whose newest reading is older than the one displayed, so a deleted newest
// reading would otherwise be kept from the stale copy.
function dropCachedReading(queryClient, readingId) {
  const drop = (current) =>
    Array.isArray(current) ? current.filter((row) => row?.id !== readingId) : current;
  queryClient.setQueriesData({ queryKey: ["glucose-readings"] }, drop);
  queryClient.setQueriesData({ queryKey: ["latest-glucose"] }, drop);
}

// The Journal reads glucose through its own keys, so its day and month views
// have to be told the reading changed too.
function invalidateJournal(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["history-summary"] });
  queryClient.invalidateQueries({ queryKey: ["history-day-recap"] });
  queryClient.invalidateQueries({ queryKey: ["history-month-readings"] });
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const { connected: dexcomConnected, isLoading: dexcomLoading, connection: dexcomConnection } = useDexcomConnection();
  const { requestRefresh } = useDexcomRefresh();
  const stackingAlertsEnabled = localStorage.getItem("stacking_alerts_enabled") !== "false";

  const { data: rawDoses = EMPTY, isLoading: loadingDoses } = useQuery({
    queryKey: ["insulin-doses", user.id],
    queryFn: ({ signal }) => boundedRead(() => base44.entities.InsulinDose.filter({ created_by_id: user.id }, "-administered_at", 100), signal),
    retry: false,
    networkMode: 'always',
    staleTime: FRESH_DATA_MS,
    gcTime: GRAPH_DATA_MS,
  });

  const {
    data: rawLatestGlucoseRows = EMPTY,
    isLoading: loadingLatestGlucose,
    dataUpdatedAt: latestGlucoseUpdatedAt,
    isFetchedAfterMount,
    isSuccess: latestQuerySuccess,
  } = useQuery({
    queryKey: ["latest-glucose", user.id],
    queryFn: ({ signal }) => boundedRead(() => base44.entities.GlucoseReading.filter({ source: { $ne: 'system' }, $or: [{ user_id: user.id }, { created_by_id: user.id }] }, "-recorded_at", 1), signal),
    retry: false,
    networkMode: 'always',
    staleTime: 30 * 1000,
    refetchInterval: dexcomConnected ? 60_000 : false,
    gcTime: GRAPH_DATA_MS,
    // A tab switch paints the saved reading from cache and revalidates quietly
    // once it is older than staleTime, instead of blocking the mount on a read.
    // The cached reading carries the moment it was saved, so an old
    // observation is immediately stale and revalidates instead of passing as
    // fresh. Only the account that saved it can read it back.
    initialData: () => readCachedLatestGlucose(user.id),
    initialDataUpdatedAt: () => readCachedLatestGlucoseSavedAt(user.id),
  });

  useEffect(() => {
    if (isFetchedAfterMount && latestQuerySuccess && rawLatestGlucoseRows[0]?.source !== 'system') {
      writeCachedLatestGlucose(rawLatestGlucoseRows[0], user.id);
    }
  }, [rawLatestGlucoseRows, isFetchedAfterMount, latestQuerySuccess, user.id]);

  const { data: rawGlucoseReadings = EMPTY, dataUpdatedAt: historyLoadedAt, isFetching: historyFetching, error: historyError } = useQuery({
    queryKey: ["glucose-readings", "graph", user.id],
    queryFn: async ({ signal }) => {
      const fresh = await boundedRead(() => base44.entities.GlucoseReading.filter({ $or: [{ user_id: user.id }, { created_by_id: user.id }], recorded_at: { $gte: new Date(Date.now() - GRAPH_WINDOW_MS).toISOString() } }, "-recorded_at", 400), signal);
      // Never step the chart back: a slower refetch that returns an older
      // newest reading is dropped, and duplicate timestamps collapse to the
      // most recently written row.
      return mergeReadingSeries(queryClient.getQueryData(["glucose-readings", "graph", user.id]), fresh);
    },
    retry: false,
    networkMode: 'always',
    staleTime: GRAPH_DATA_MS,
    refetchInterval: dexcomConnected ? 120_000 : false,
    gcTime: 30 * 60 * 1000,
  });



  const { data: rawCarbEntries = EMPTY, isLoading: loadingCarbs } = useQuery({
    queryKey: ["carb-entries", user.id],
    queryFn: ({ signal }) => boundedRead(() => base44.entities.CarbEntry.filter({ created_by_id: user.id }, "-consumed_at", 100), signal),
    retry: false,
    networkMode: 'always',
    staleTime: FRESH_DATA_MS,
    gcTime: GRAPH_DATA_MS,
  });

  const { data: rawGraphCarbs = EMPTY } = useQuery({
    queryKey: ["carb-entries", "graph", user.id],
    queryFn: ({ signal }) => boundedRead(() => base44.entities.CarbEntry.filter({ created_by_id: user.id }, "-consumed_at", 1000), signal),
    retry: false,
    networkMode: 'always',
    staleTime: GRAPH_DATA_MS,
    gcTime: 30 * 60 * 1000,
    placeholderData: () => queryClient.getQueryData(["carb-entries", "graph", user.id]) ?? rawCarbEntries,
  });

  const { data: rawGraphDoses = EMPTY } = useQuery({
    queryKey: ["insulin-doses", "graph", user.id],
    queryFn: ({ signal }) => boundedRead(() => base44.entities.InsulinDose.filter({ created_by_id: user.id }, "-administered_at", 1000), signal),
    retry: false,
    networkMode: 'always',
    staleTime: GRAPH_DATA_MS,
    gcTime: 30 * 60 * 1000,
    placeholderData: () => queryClient.getQueryData(["insulin-doses", "graph", user.id]) ?? rawDoses,
  });

  const freshness = usePatientResumeSnapshot(user.id, {
    doses: rawDoses, latestGlucoseRows: rawLatestGlucoseRows, glucoseReadings: rawGlucoseReadings,
    carbEntries: rawCarbEntries, graphDosesSource: rawGraphDoses, graphCarbsSource: rawGraphCarbs,
    confirmedAt: latestGlucoseUpdatedAt, verified: latestQuerySuccess && isFetchedAfterMount,
  }, requestRefresh, {
    // The shell keeps this screen mounted behind the other tabs, so a resume
    // re-reads its whole snapshot only while it is the screen in front of the
    // person. Anywhere else it refreshes just the latest reading.
    visibleScreen: pathname === "/",
  });
  const historyReady = historyLoadedAt > 0 && !freshness.blocked;
  const { doses, latestGlucoseRows, glucoseReadings, carbEntries, graphDosesSource, graphCarbsSource } = freshness.snapshot;
  const now = freshness.now;
  const mergedGraphReadings = useMemo(() => {
    const byId = new Map(glucoseReadings.map(r => [r.id, r]));
    latestGlucoseRows.forEach(r => byId.set(r.id, r));
    return [...byId.values()].filter(r => Number.isFinite(Number(r.value)) && Number(r.value) > 0 &&
      Number.isFinite(Date.parse(r.recorded_at)) && Date.parse(r.recorded_at) <= now)
      .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
  }, [glucoseReadings, latestGlucoseRows, now]);
  // Generation follows the newest reading only; freshness is decided inside
  // the hook by a single clock, so nothing here adds a second age rule.
  const { projection, abstainNote } = useLatestProjection({
    latestReadingTime: latestGlucoseRows[0]?.recorded_at || null,
    // Only a live sensor gives a forecast something to extend.
    enabled: dexcomConnected,
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
      if (cancelled || document.visibilityState !== 'visible') return;
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
    onSuccess: (_data, deletedId) => {
      // When the removed reading was this device's saved newest one, that copy
      // goes too, so the hero falls back to the reading before it instead of
      // re-showing a reading that no longer exists.
      if (readCachedLatestGlucose(user.id)[0]?.id === deletedId) clearCachedLatestGlucose();
      dropCachedReading(queryClient, deletedId);
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      invalidateJournal(queryClient);
      toast.success("Reading gently removed");
    },
    onError: (error) => {
      // Nothing was removed, so the reading stays exactly where it was.
      console.error("Unable to remove reading", error);
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.error("Unable to remove this reading. Please try again.");
    },
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      // Removing carbohydrate changes the forecast's inputs: rebuild it.
      markProjectionInputsChanged();
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
      // Removing insulin changes the forecast's inputs: rebuild it.
      markProjectionInputsChanged();
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
        replaceCachedItem(queryClient, ["insulin-doses", user.id], updatedItem);
        replaceCachedItem(queryClient, ["insulin-doses", "graph", user.id], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
        queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      } else if (variables.type === "glucose") {
        replaceCachedItem(queryClient, ["latest-glucose", user.id], updatedItem);
        replaceCachedItem(queryClient, ["glucose-readings"], updatedItem);
        replaceCachedItem(queryClient, ["glucose-readings", "graph", user.id], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
        queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
        queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
        invalidateJournal(queryClient);
        const latest = queryClient.getQueryData(["latest-glucose", user.id])?.[0];
        if (latest?.id === updatedItem.id) writeCachedLatestGlucose(updatedItem, user.id);
      } else {
        replaceCachedItem(queryClient, ["carb-entries", user.id], updatedItem);
        replaceCachedItem(queryClient, ["carb-entries", "graph", user.id], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
        queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      }

      // An edited meal (carbs, name, rescue flag) or dose changes the forecast's
      // inputs without changing any timestamp, so the projection is rebuilt.
      if (variables.type !== "glucose") markProjectionInputsChanged();

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

  // ── Jitter fix: memoize all filtered arrays with a stabilized `now` ──
  // Previously these were plain .filter() calls on every render, producing new
  // array references each time. New references cascade into ActivityGraph's
  // useMemo hooks (chartData, allCurvesMeta, etc.) causing recharts to
  // re-render on every Dashboard tick even when the data hasn't changed.
  const recentDoses = useMemo(() => doses.filter((dose) => {
    const age = now - new Date(dose.administered_at).getTime();
    return age < TWO_DAYS_MS;
  }), [doses, now]);

  const heroGlucoseReadings = mergedGraphReadings;

  const recentGlucose = useMemo(() => heroGlucoseReadings.filter((reading) => {
    const age = now - new Date(reading.recorded_at).getTime();
    return age < ONE_DAY_MS;
  }), [heroGlucoseReadings, now]);

  const recentCarbs = useMemo(() => carbEntries.filter((entry) => {
    const age = now - new Date(entry.consumed_at).getTime();
    return age < ONE_DAY_MS;
  }), [carbEntries, now]);

  const graphGlucose = useMemo(() => mergedGraphReadings.filter((reading) => {
    const age = now - new Date(reading.recorded_at).getTime();
    return age < FOURTEEN_DAYS_MS;
  }), [mergedGraphReadings, now]);

  const graphDoses = useMemo(() => graphDosesSource.filter((dose) => {
    const age = now - new Date(dose.administered_at).getTime();
    return age < FOURTEEN_DAYS_MS;
  }), [graphDosesSource, now]);

  const graphCarbs = useMemo(() => graphCarbsSource.filter((entry) => {
    const age = now - new Date(entry.consumed_at).getTime();
    return age < FOURTEEN_DAYS_MS;
  }), [graphCarbsSource, now]);

  // The current reading is the newest REAL measurement. A carry-forward
  // `system` row (which only bridges a gap) is never presented as a current
  // reading, and a cached row is refreshed by the live query on mount.
  const latestGlucose = useMemo(() => mergedGraphReadings.find(r => r && r.source !== 'system') || null, [mergedGraphReadings]);

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
    historyReady && !historyError && !freshness.pending && freshness.verified && freshness.secondaryVerified &&
    !loadingDoses &&
    !loadingLatestGlucose &&
    !loadingCarbs &&
    recentDoses.length === 0 &&
    recentGlucose.length === 0 &&
    recentCarbs.length === 0;

  return (
    <div data-freshness="ready" className="dashboard-page relative w-full max-w-full min-w-0 space-y-0 overflow-x-hidden">
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
              liveReadingPending={freshness.pending}
              liveReadingRefreshing={freshness.refreshing}
              liveReadingUnverified={!freshness.verified}
              balanceReadings={glucoseReadings}
              historyReady={historyReady && rawGlucoseReadings.length < 5000}
              historyLoading={historyFetching}
              historyError={Boolean(historyError) || freshness.blocked}
              snapshotNow={now}
              resumeRevision={freshness.revision}
              secondaryUnverified={!freshness.secondaryVerified}
              glucoseReadings={heroGlucoseReadings}
              carbEntries={recentCarbs}
              connectBanner={!dexcomConnected && !dexcomLoading ? (
                <ConnectGlucoseSourcePrompt connection={dexcomConnection} />
              ) : null}
              graphSlot={
                <ActivityGraph
                  doses={graphDoses}
                  glucoseReadings={historyReady ? graphGlucose : EMPTY}
                  historyReady={historyReady}
                  historyLoading={historyFetching}
                  historyError={Boolean(historyError) || freshness.blocked}
                  carbEntries={graphCarbs}
                  onSelectLog={setEditingLog}
                  onDeleteLog={handleDeleteLog}
                  projection={freshness.verified ? projection : null}
                  projectionNote={freshness.verified ? abstainNote : null}
                  snapshotNow={now}
                  resumeRevision={freshness.revision}
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