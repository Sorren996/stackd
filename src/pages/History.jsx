import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import DoseCard from "../components/DoseCard";
import GlucoseCard from "../components/GlucoseCard";
import CarbCard from "../components/CarbCard";
import { toast } from "sonner";
import { CalendarDays, ChevronRight } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { motion } from "framer-motion";

function CollapsibleDateGroup({ label, count, isOpen, onToggle, children }) {
  return (
    <motion.div
      animate={{
        borderColor: isOpen ? "rgba(20, 184, 166, 0.4)" : "rgba(255, 255, 255, 0.05)",
        boxShadow: isOpen
          ? "0 0 15px rgba(20, 184, 166, 0.15), inset 0 0 0 1px rgba(20, 184, 166, 0.1)"
          : "0 0 0px rgba(0,0,0,0)"
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="bg-white/[0.02] border rounded-2xl overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white/90">{label}</span>
          <span className="text-sm bg-white/10 px-2 py-0.5 rounded-full text-white/50">
            {count} {count === 1 ? "log" : "logs"}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <ChevronRight className="w-4 h-4 text-white/40" />
        </motion.div>
      </button>

      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        className="overflow-hidden"
      >
        <div className="border-t border-white/5 divide-white/5 space-y-3">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
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

export default function History() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("doses");
  const [openGroup, setOpenGroup] = useState(null);

  const { data: doses = [], isLoading: loadingDoses } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 200)
  });

  const { data: glucoseReadings = [], isLoading: loadingGlucose } = useQuery({
    queryKey: ["glucose-readings"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 300)
  });

  const { data: carbEntries = [], isLoading: loadingCarbs } = useQuery({
    queryKey: ["carb-entries"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 300)
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

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      toast.success("Carb entry removed");
    }
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

  const targetLow = parseInt(localStorage.getItem("target_range_low") || "70", 10);
  const targetHigh = parseInt(localStorage.getItem("target_range_high") || "180", 10);

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
      <div className="flex justify-center">
        <div
          className="flex items-center gap-1 p-1 rounded-3xl border border-white/20 bg-white/5 backdrop-blur-sm shadow-lg"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)"
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
                transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
            <span className="relative z-10">Insulin Doses</span>
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
                transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
            <span className="relative z-10">Glucose Readings</span>
          </button>

          <button
            onClick={() => handleTabChange("carbs")}
            className={`relative px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              activeTab === "carbs" ? "text-amber-400" : "text-white/40 hover:text-white/70"
            }`}>
            {activeTab === "carbs" && (
              <motion.div
                layoutId="active-history-tab"
                className="absolute inset-0 rounded-2xl -z-10"
                style={{ backgroundColor: "rgba(245,158,11,0.15)" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
            <span className="relative z-10">Carb Log</span>
          </button>
        </div>
      </div>

      {activeTab === "doses" && (
        <div className="space-y-6">
          {doseGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No doses logged yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Head to the Dashboard to log your first dose.</p>
            </div>
          ) : (
            doseGroups.map((group) => (
              <CollapsibleDateGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((dose) => (
                  <DoseCard key={dose.id} dose={dose} onDelete={(id) => deleteDose.mutate(id)} />
                ))}
              </CollapsibleDateGroup>
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
              <div key={window.label} className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{window.label} Avg</p>
                <p className="text-xl text-white mt-1 font-extrabold text-center">{getAverage(window.days)}</p>
                <p className="text-[10px] text-white/30 mt-0.5">mg/dL</p>
              </div>
            ))}
            <div className="bg-white/5 border border-teal-500/20 rounded-2xl p-3 text-center" style={{ boxShadow: "0 0 15px rgba(20, 184, 166, 0.05)" }}>
              <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">In Range</p>
              <p className="text-xl text-teal-400 mt-1 font-extrabold text-center">{inRangePercentage}</p>
              <p className="text-[10px] text-teal-400/50 mt-0.5">{targetLow}–{targetHigh} mg/dL</p>
            </div>
          </div>

          {glucoseGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No glucose logs for the last 30 days</h3>
              <p className="text-sm text-muted-foreground mt-1">Glucose logs recorded in the dashboard will appear here.</p>
            </div>
          ) : (
            glucoseGroups.map((group) => (
              <CollapsibleDateGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((reading) => (
                  <GlucoseCard key={reading.id} reading={reading} onDelete={(id) => deleteGlucose.mutate(id)} />
                ))}
              </CollapsibleDateGroup>
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
              <div key={window.label} className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{window.label}</p>
                <p className="text-xl text-white mt-1 font-extrabold">{getCarbAverage(window.days)}</p>
                <p className="text-[10px] text-white/30 mt-0.5">g / day</p>
              </div>
            ))}
          </div>
          <div className="bg-white/5 border border-amber-500/20 rounded-2xl p-3 text-center" style={{ boxShadow: "0 0 15px rgba(245,158,11,0.05)" }}>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Total Carbs (30 Days)</p>
            <p className="text-2xl text-amber-400 mt-1 font-extrabold">{totalCarbsLast30}g</p>
          </div>

          {carbGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No carb entries yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Log food from the Dashboard to see it here.</p>
            </div>
          ) : (
            carbGroups.map((group) => (
              <CollapsibleDateGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((entry) => (
                  <CarbCard key={entry.id} entry={entry} onDelete={(id) => deleteCarb.mutate(id)} />
                ))}
              </CollapsibleDateGroup>
            ))
          )}
        </div>
      )}
    </div>
  );
}
