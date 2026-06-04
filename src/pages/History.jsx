import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import DoseCard from "../components/DoseCard";
import GlucoseCard from "../components/GlucoseCard";
import { toast } from "sonner";
import { CalendarDays, ChevronRight, ChevronDown } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { motion } from "framer-motion";


function CollapsibleDateGroup({ label, count, children }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors">
        
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white/90">{label}</span>
          <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/50">
            {count} {count === 1 ? "log" : "logs"}
          </span>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
      </button>
      {isOpen &&
      <div className="border-t border-white/5 divide-y divide-white/5">
          {children}
        </div>
      }
    </div>);

}

function groupByDate(items, dateField) {
  const groups = {};
  items.forEach((item) => {
    const date = format(parseISO(item[dateField]), "yyyy-MM-dd");
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  });
  return Object.entries(groups).
  sort(([a], [b]) => b.localeCompare(a)).
  map(([date, items]) => {
    const d = parseISO(date);
    let label = format(d, "EEEE, MMMM d");
    if (isToday(d)) label = "Today";else
    if (isYesterday(d)) label = "Yesterday";
    return { date, label, items };
  });
}

export default function History() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("doses");

  const { data: doses = [], isLoading: loadingDoses } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 200)
  });

  const { data: glucoseReadings = [], isLoading: loadingGlucose } = useQuery({
    queryKey: ["glucose-readings"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 300)
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose removed");
    }
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Glucose reading removed");
    }
  });

  const doseGroups = groupByDate(doses, "administered_at");

  const glucose30Days = glucoseReadings.filter((r) => {
    return Date.now() - new Date(r.recorded_at).getTime() <= 30 * 24 * 60 * 60 * 1000;
  });
  const glucoseGroups = groupByDate(glucose30Days, "recorded_at");

  const getAverage = (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = glucoseReadings.filter((r) => new Date(r.recorded_at).getTime() >= cutoff);
    if (!filtered.length) return "—";
    const sum = filtered.reduce((acc, curr) => acc + curr.value, 0);
    return `${Math.round(sum / filtered.length)}`;
  };

  if (loadingDoses || loadingGlucose) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="space-y-6">
  <div className="flex justify-center">
  <div
          className="flex items-center gap-1 p-1 rounded-3xl border border-white/20 bg-white/5 backdrop-blur-sm shadow-lg"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          }}>
          
    <button
            onClick={() => setActiveTab("doses")}
            className={`relative px-4 py-2 rounded-2xl text-xs font-medium transition-colors ${
            activeTab === "doses" ? "text-white" : "text-white/40 hover:text-white/70"}`
            }>
            
      {activeTab === "doses" &&
            <motion.div
              layoutId="active-history-tab"
              className="absolute inset-0 bg-white/10 rounded-2xl -z-10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }} />

            }
      <span className="relative z-10">Insulin Doses</span>
    </button>
    
    <button
            onClick={() => setActiveTab("glucose")}
            className={`relative px-4 py-2 rounded-2xl text-xs font-medium transition-colors ${
            activeTab === "glucose" ? "text-white" : "text-white/40 hover:text-white/70"}`
            }>
            
      {activeTab === "glucose" &&
            <motion.div
              layoutId="active-history-tab"
              className="absolute inset-0 bg-white/10 rounded-2xl -z-10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }} />

            }
      <span className="relative z-10">Glucose Readings</span>
    </button>
  </div>
  </div>

      {activeTab === "doses" ?
      <div className="space-y-6">
          {doseGroups.length === 0 ?
        <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No doses logged yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Head to the Dashboard to log your first dose.</p>
            </div> :

        doseGroups.map((group) =>
        <CollapsibleDateGroup key={group.date} label={group.label} count={group.items.length}>
                {group.items.map((dose) =>
          <DoseCard key={dose.id} dose={dose} onDelete={(id) => deleteDose.mutate(id)} />
          )}
              </CollapsibleDateGroup>
        )
        }
        </div> :

      <div className="space-y-6">
          {/* Averages Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
          { label: "1 Day", days: 1 },
          { label: "3 Day", days: 3 },
          { label: "7 Day", days: 7 },
          { label: "14 Day", days: 14 },
          { label: "30 Day", days: 30 }].
          map((window) =>
          <div key={window.label} className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{window.label} Avg</p>
                <p className="text-xl text-white mt-1 font-extrabold">{getAverage(window.days)}</p>
                <p className="text-[10px] text-white/30 mt-0.5">mg/dL</p>
              </div>
          )}
          </div>

          {glucoseGroups.length === 0 ?
        <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No glucose logs for the last 30 days</h3>
              <p className="text-sm text-muted-foreground mt-1">Glucose logs recorded in the dashboard will appear here.</p>
            </div> :

        glucoseGroups.map((group) =>
        <CollapsibleDateGroup key={group.date} label={group.label} count={group.items.length}>
                {group.items.map((reading) =>
          <GlucoseCard key={reading.id} reading={reading} onDelete={(id) => deleteGlucose.mutate(id)} />
          )}
              </CollapsibleDateGroup>
        )
        }
        </div>
      }
    </div>);

}