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
import { Activity, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
  } catch {
    // Ignore storage failures; the live query still owns the source of truth.
  }
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [renderGraph, setRenderGraph] = useState(false);
  const stackingAlertsEnabled = localStorage.getItem("stacking_alerts_enabled") !== "false";

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const scheduleFrame = typeof window !== "undefined" && window.requestAnimationFrame
      ? window.requestAnimationFrame
      : (callback) => window.setTimeout(callback, 16);
    const cancelFrame = typeof window !== "undefined" && window.cancelAnimationFrame
      ? window.cancelAnimationFrame
      : window.clearTimeout;
    const id = scheduleFrame(() => setRenderGraph(true));

    return () => cancelFrame(id);
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
      toast.success("Glucose reading removed");
    },
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      toast.success("Carb entry removed");
    },
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      toast.success("Dose removed");
    },
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
        ["rising", "active", "declining"].includes(item.status.phase) &&
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
      <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} />

      {shouldShowEmptyState ? (
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <Activity className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold text-white">No active insulin</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Log your first dose to see its pharmacokinetic curve - onset, peak, and duration - all visualized on a
            timeline.
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
            <div className="dashboard-stacking-alert mx-0 flex w-full max-w-full min-w-0 items-start gap-3 overflow-hidden rounded-xl p-4 pb-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Insulin Stacking Detected</p>
                <p className="mt-0.5 text-sm opacity-80">
                  {activeRapidCount} rapid/short-acting doses are active simultaneously. Monitor for low blood sugar.
                </p>
              </div>
            </div>
          )}

          <div className="mb-2 w-full max-w-full min-w-0">
            <p className="mb-2 px-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
              Glucose Trend
            </p>
            {renderGraph ? (
              <ActivityGraph doses={graphDoses} glucoseReadings={graphGlucose} carbEntries={graphCarbs} />
            ) : (
              <div className="h-[320px] w-full" />
            )}
          </div>

          <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-6 overflow-x-hidden border-0 px-0 py-4 lg:grid-cols-3">
            <div className="min-w-0 max-w-full space-y-2 overflow-x-hidden lg:col-span-2">
              <p className="mx-4 mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
                Recent Activity
              </p>
              <div className="w-full max-w-full min-w-0 space-y-2 overflow-x-hidden">
                {(showAllDoses ? recentActivity.slice(0, 15) : recentActivity.slice(0, 5)).map((item) =>
                  item.feedType === "insulin" ? (
                    <DoseCard key={`dose-${item.id}`} dose={item} onDelete={(id) => deleteDose.mutate(id)} />
                  ) : item.feedType === "carbs" ? (
                    <CarbCard key={`carb-${item.id}`} entry={item} onDelete={(id) => deleteCarb.mutate(id)} />
                  ) : (
                    <GlucoseCard key={`glucose-${item.id}`} reading={item} onDelete={(id) => deleteGlucose.mutate(id)} />
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

      <button
        type="button"
        onClick={() => setDoseFormOpen(true)}
        className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border backdrop-blur-2xl transition active:scale-95"
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
    </div>
  );
}
