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

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const stackingAlertsEnabled = localStorage.getItem("stacking_alerts_enabled") !== "false";

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const { data: doses = [], isLoading } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 50),
  });

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ["glucose-readings"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 100),
  });

  const { data: carbEntries = [] } = useQuery({
    queryKey: ["carb-entries"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 100),
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Glucose reading removed");
    },
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      toast.success("Carb entry removed");
    },
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose removed");
    },
  });

  const recentDoses = doses.filter((dose) => {
    const age = Date.now() - new Date(dose.administered_at).getTime();
    return age < 48 * 60 * 60 * 1000;
  });

  const recentGlucose = glucoseReadings.filter((reading) => {
    const age = Date.now() - new Date(reading.recorded_at).getTime();
    return age < 24 * 60 * 60 * 1000;
  });

  const recentCarbs = carbEntries.filter((entry) => {
    const age = Date.now() - new Date(entry.consumed_at).getTime();
    return age < 24 * 60 * 60 * 1000;
  });

  const latestGlucose = glucoseReadings[0] || null;

  const activeRapidCount = useMemo(() => {
    const activeDoses = recentDoses
      .map((dose) => ({ dose, status: getDoseStatus(dose) }))
      .filter(({ status }) => status.phase !== "expired");

    return activeDoses.filter(
      ({ dose, status }) =>
        ["rising", "active", "declining"].includes(status.phase) &&
        ["Rapid-Acting", "Short-Acting"].includes(INSULIN_PROFILES[dose.insulin_type]?.category),
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

  if (isLoading) {
    return (
      <div className="flex h-[60vh] w-full max-w-full items-center justify-center overflow-hidden">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="dashboard-page w-full max-w-full min-w-0 space-y-0 overflow-x-hidden">
      <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} />

      {recentDoses.length === 0 && recentGlucose.length === 0 && recentCarbs.length === 0 ? (
        <div className="flex w-full max-w-full flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
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
              glucoseReadings={glucoseReadings}
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

          <div className="mb-2 w-full max-w-full min-w-0 overflow-x-hidden">
            <p className="mb-2 px-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
              Glucose Trend
            </p>
            <div className="-mx-4 w-[calc(100%+2rem)] max-w-none min-w-0 overflow-hidden sm:mx-0 sm:w-full sm:max-w-full">
              <ActivityGraph doses={recentDoses} glucoseReadings={recentGlucose} carbEntries={recentCarbs} />
            </div>
          </div>

          <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-6 overflow-x-hidden border-0 lg:grid-cols-3">
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
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 shadow-lg backdrop-blur-xl transition active:scale-95 sm:right-5"
        aria-label="Log dose"
      >
        <Plus className="h-7 w-7 text-white/80" />
      </button>
    </div>
  );
}
