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
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const stackingAlertsEnabled = localStorage.getItem("stacking_alerts_enabled") !== "false";

  // Auto-refresh every 60s to update statuses
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const { data: doses = [], isLoading } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 50)
  });

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ["glucose-readings"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 100)
  });

  const { data: carbEntries = [] } = useQuery({
    queryKey: ["carb-entries"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 100)
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Glucose reading removed");
    }
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      toast.success("Carb entry removed");
    }
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose removed");
    }
  });

  // Filter doses that are still relevant (last 24 hours)
  const recentDoses = doses.filter((d) => {
    const age = Date.now() - new Date(d.administered_at).getTime();
    return age < 48 * 60 * 60 * 1000; // 48 hours for long-acting
  });

  const recentGlucose = glucoseReadings.filter((g) => {
    const age = Date.now() - new Date(g.recorded_at).getTime();
    return age < 24 * 60 * 60 * 1000;
  });

  const recentCarbs = carbEntries.filter((e) => {
    const age = Date.now() - new Date(e.consumed_at).getTime();
    return age < 24 * 60 * 60 * 1000;
  });

  const latestGlucose = glucoseReadings[0] || null;

  const activeRapidCount = useMemo(() => {
    const activeDoses = recentDoses
      .map((dose) => ({ dose, status: getDoseStatus(dose) }))
      .filter((d) => d.status.phase !== "expired");
    return activeDoses.filter(
      (d) =>
        ["rising", "active", "declining"].includes(d.status.phase) &&
        ["Rapid-Acting", "Short-Acting"].includes(INSULIN_PROFILES[d.dose.insulin_type]?.category)
    ).length;
  }, [recentDoses]);

  const recentActivity = useMemo(() => {
    const doseLogs = recentDoses.map((d) => ({ ...d, feedType: "insulin", timestamp: new Date(d.administered_at).getTime() }));
    const glucoseLogs = recentGlucose.map((g) => ({ ...g, feedType: "glucose", timestamp: new Date(g.recorded_at).getTime() }));
    const carbLogs = recentCarbs.map((e) => ({ ...e, feedType: "carbs", timestamp: new Date(e.consumed_at).getTime() }));
    return [...doseLogs, ...glucoseLogs, ...carbLogs].sort((a, b) => b.timestamp - a.timestamp);
  }, [recentDoses, recentGlucose, recentCarbs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="space-y-0">
      <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} />

      {recentDoses.length === 0 && recentGlucose.length === 0 && recentCarbs.length === 0 ?
      <div className="flex flex-col items-center justify-center py-20 text-center">
          <Activity className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-semibold text-white">No active insulin</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Log your first dose to see its pharmacokinetic curve — onset, peak, and duration — all visualized on a timeline.
          </p>
        </div> :

      <>
          <ActiveInsulinBanner doses={recentDoses} latestGlucose={latestGlucose} glucoseReadings={glucoseReadings} carbEntries={recentCarbs} />

          {stackingAlertsEnabled && activeRapidCount > 1 && (
            <div className="dashboard-stacking-alert mx-0 flex items-start gap-3 rounded-xl p-4 pb-3 sm:mx-0">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-sm">Insulin Stacking Detected</p>
                <p className="text-sm mt-0.5 opacity-80">
                  {activeRapidCount} rapid/short-acting doses are active simultaneously. Monitor for low blood sugar.
                </p>
              </div>
            </div>
          )}

          <div className="mb-2">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.18em] mb-2 px-0">Glucose Trend</p>
            <ActivityGraph doses={recentDoses} glucoseReadings={recentGlucose} carbEntries={recentCarbs} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3 overflow-hidden border:0 -mx-4">
            <div className="lg:col-span-2 space-y-2">
              <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.18em] mb-3 mx-4">Recent Activity</p>
              <div className="space-y-2">
                {(showAllDoses ? recentActivity.slice(0, 15) : recentActivity.slice(0, 5)).map((item) =>
                item.feedType === "insulin" ?
                  <DoseCard key={`dose-${item.id}`} dose={item} onDelete={(id) => deleteDose.mutate(id)} /> :
                item.feedType === "carbs" ?
                  <CarbCard key={`carb-${item.id}`} entry={item} onDelete={(id) => deleteCarb.mutate(id)} /> :
                  <GlucoseCard key={`glucose-${item.id}`} reading={item} onDelete={(id) => deleteGlucose.mutate(id)} />
              )}
              </div>
              {recentActivity.length > 5 &&
            <button
              onClick={() => setShowAllDoses((v) => !v)}
              className="text-sm hover:underline font-medium mt-1 text-[hsl(var(--muted-foreground))] mx-4 hidden">
                  {showAllDoses ? "Show less" : `Show more (${Math.min(recentActivity.length, 10) - 5} more)`}
                </button>
            }
            </div>
            <div>
              <ActiveAlerts doses={recentDoses} />
            </div>
          </div>
        </>
      }
      {/* Floating Log Dose FAB */}
      <button
        onClick={() => setDoseFormOpen(true)}
        className="
fixed bottom-24 right-5 z-40
w-14 h-14
flex items-center justify-center
rounded-full
bg-white/10
backdrop-blur-xl
border border-white/10
shadow-lg
active:scale-95 transition">









        
  <Plus className="w-7 h-7 text-white/80" />
      </button>
    </div>);


}