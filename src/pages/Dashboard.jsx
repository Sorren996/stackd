import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ActivityGraph from "../components/ActivityGraph";
import ActiveInsulinBanner from "../components/ActiveInsulinBanner";
import ActiveAlerts from "../components/ActiveAlerts";
import DoseForm from "../components/DoseForm";
import DoseCard from "../components/DoseCard";
import { Activity, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [showAllDoses, setShowAllDoses] = useState(false);
  const [doseFormOpen, setDoseFormOpen] = useState(false);

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

  const latestGlucose = glucoseReadings[0] || null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="space-y-6">
      <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} />

      {recentDoses.length === 0 && recentGlucose.length === 0 ?
      <div className="flex flex-col items-center justify-center py-20 text-center">
          





        
          <Activity className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-semibold text-[hsl(var(--popover))]">No active insulin</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Log your first dose to see its pharmacokinetic curve — onset, peak, and duration — all visualized on a timeline.
          </p>
        </div> :

      <>
          <ActiveInsulinBanner doses={recentDoses} latestGlucose={latestGlucose} glucoseReadings={glucoseReadings} />
      <ActivityGraph doses={recentDoses} glucoseReadings={recentGlucose} />

          <div className="grid gap-6 lg:grid-cols-3 overflow-hidden border:0 -mx-4">
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-lg font-semibold text-[hsl(var(--popover))] mx-4 text-[hsl(var(--card-foreground))] px-0 py-1 font-medium opacity-65 rounded-full opacity-65 rounded-full">Recent Doses</h2>
              <div className="space-y-2">
                {(showAllDoses ? recentDoses.slice(0, 10) : recentDoses.slice(0, 3)).map((dose) =>
              <DoseCard
                key={dose.id}
                dose={dose}
                onDelete={(id) => deleteDose.mutate(id)} />

              )}
              </div>
              {recentDoses.length > 3 &&
            <button
              onClick={() => setShowAllDoses((v) => !v)}
              className="text-sm hover:underline font-medium mt-1 text-[hsl(var(--muted-foreground))] mx-4">
                  {showAllDoses ? "Show less" : `Show more (${Math.min(recentDoses.length, 10) - 3} more)`}
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
backdrop-blur-l
border border-white/10
shadow-lg
active:scale-95 transition"
>
  <Plus className="w-7 h-7 text-white/80" />
      </button>
    </div>
  );

}