import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import PageHeader from "@/components/editorial/PageHeader";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";
import AnchorNumber from "@/components/editorial/AnchorNumber";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import EditLogSheet from "@/components/edit/EditLogSheet";
import { cancelSplitPlansForMeal, cleanupSplitPlansForDose } from "@/lib/splitDoseUtils";
import { groupDaysByMonth, monthStats } from "@/lib/historyAggregations";
import HistoryMonthView from "@/components/history/HistoryMonthView";
import HistoryWeekList from "@/components/history/HistoryWeekList";
import MonthHeatmap from "@/components/history/MonthHeatmap";
import DayRecap from "@/components/history/DayRecap";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useAuth } from "@/lib/AuthContext";
import { scrollToTop } from "@/lib/feedScroll";

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180
  };
}

function replaceCachedItem(queryClient, queryKey, updatedItem) {
  queryClient.setQueryData(queryKey, (current = []) =>
  Array.isArray(current) ? current.map((item) => item.id === updatedItem.id ? { ...item, ...updatedItem } : item) : current
  );
}

export default function History() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const levelOrder = { month: 0, days: 1, recap: 2 };
  const { connected: dexcomConnected } = useDexcomConnection();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [level, setLevel] = useState("month"); // month | days | recap
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [targetRange, setTargetRange] = useState(readTargetRange);
  const [direction, setDirection] = useState(1);
  const [viewMode, setViewMode] = useState("list");
  const levelRef = useRef(level);

  useEffect(() => {
    const updateTargetRange = () => setTargetRange(readTargetRange());

    window.addEventListener("target-range-updated", updateTargetRange);
    window.addEventListener("storage", updateTargetRange);

    return () => {
      window.removeEventListener("target-range-updated", updateTargetRange);
      window.removeEventListener("storage", updateTargetRange);
    };
  }, []);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["history-summary"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getHistorySummary", {
        tzOffsetMinutes: new Date().getTimezoneOffset()
      });
      return res.data;
    },
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    // Always refetch on mount so a transient error from a previous load is
    // never stuck behind staleTime — the keep-alive Layout means this page
    // stays mounted (hidden) when the user navigates to another tab.
    refetchOnMount: "always"
  });

  const allDays = summary?.days || [];
  const targetLow = summary?.targetLow ?? targetRange.low;
  const targetHigh = summary?.targetHigh ?? targetRange.high;

  const months = useMemo(() => groupDaysByMonth(allDays), [allDays]);
  const currentMonth = useMemo(() => months.find((m) => m.key === selectedMonth) || null, [months, selectedMonth]);
  const monthDays = useMemo(
    () => currentMonth ? [...currentMonth.days].sort((a, b) => b.date.localeCompare(a.date)) : [],
    [currentMonth]
  );
  const selectedDaySummary = useMemo(
    () => allDays.find((d) => d.date === selectedDay) || null,
    [allDays, selectedDay]
  );

  // Keep a ref of the current level so the URL-sync effect can detect whether
  // a navigation moved deeper or shallower and pick the slide direction.
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  // URL ↔ view synchronization. The search params (month, day) are the source
  // of truth for the active view. Selecting a month/day pushes a new history
  // entry; the browser back button pops it and this effect re-derives the
  // active level, month, and day from the resolved params.
  useEffect(() => {
    const day = searchParams.get("day");
    const month = searchParams.get("month");

    let newLevel = "month";
    let newMonth = null;
    let newDay = null;

    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      newLevel = "recap";
      newDay = day;
      if (month && /^\d{4}-\d{2}$/.test(month)) newMonth = month;
    } else if (month && /^\d{4}-\d{2}$/.test(month)) {
      newLevel = "days";
      newMonth = month;
    }

    if (newLevel !== levelRef.current) {
      setDirection(levelOrder[newLevel] > levelOrder[levelRef.current] ? 1 : -1);
    }
    setLevel(newLevel);
    setSelectedMonth(newMonth);
    setSelectedDay(newDay);
    if (newLevel === "recap") requestAnimationFrame(() => scrollToTop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data: recapData = {}, isLoading: loadingRecap } = useQuery({
    queryKey: ["history-day-recap", selectedDay],
    queryFn: async () => {
      const start = new Date(`${selectedDay}T00:00:00`).toISOString();
      const end = new Date(`${selectedDay}T23:59:59`).toISOString();
      const [glucose, carbs, insulin] = await Promise.all([
      base44.entities.GlucoseReading.filter({ recorded_at: { $gte: start, $lte: end } }, "-recorded_at", 1000),
      base44.entities.CarbEntry.filter({ consumed_at: { $gte: start, $lte: end } }, "-consumed_at", 500),
      base44.entities.InsulinDose.filter({ administered_at: { $gte: start, $lte: end } }, "-administered_at", 500)]
      );
      return {
        glucose: glucose.filter((g) => g.source !== "system"),
        carbs,
        insulin
      };
    },
    enabled: level === "recap" && !!selectedDay
  });

  const { data: monthReadings = [], isLoading: loadingMonthReadings } = useQuery({
    queryKey: ["history-month-readings", selectedMonth],
    queryFn: async () => {
      if (!currentMonth || !currentMonth.days.length) return [];
      const dates = currentMonth.days.map((d) => d.date).sort();
      const start = new Date(`${dates[0]}T00:00:00`).toISOString();
      const end = new Date(`${dates[dates.length - 1]}T23:59:59`).toISOString();
      return base44.entities.GlucoseReading.filter(
        { recorded_at: { $gte: start, $lte: end }, source: { $ne: "system" } },
        "-recorded_at",
        10000
      );
    },
    enabled: level === "days" && !!selectedMonth,
    staleTime: 5 * 60 * 1000
  });

  const readingsByDay = useMemo(() => {
    const map = {};
    (monthReadings || []).forEach((r) => {
      const t = new Date(r.recorded_at);
      if (Number.isNaN(t.getTime())) return;
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push({ time: t.getTime(), value: Number(r.value) });
    });
    return map;
  }, [monthReadings]);

  // Calendar fallback: when DailySummary has no glucose data for a day
  // (reading_count = 0), fill in TIR from the raw readings fetched for the
  // month so the heatmap never shows blank cells for months with real data.
  const calendarDays = useMemo(() => {
    if (!readingsByDay || Object.keys(readingsByDay).length === 0) return monthDays;
    return monthDays.map((day) => {
      if (day.glucose?.count > 0) return day;
      const readings = readingsByDay[day.date];
      if (!readings || !readings.length) return day;
      const count = readings.length;
      const inRange = readings.filter((r) => r.value >= targetLow && r.value <= targetHigh).length;
      const sum = readings.reduce((acc, r) => acc + r.value, 0);
      return { ...day, glucose: { count, inRange, sum } };
    });
  }, [monthDays, readingsByDay, targetLow, targetHigh]);

  const invalidateHistory = () => {
    queryClient.invalidateQueries({ queryKey: ["history-summary"] });
    queryClient.invalidateQueries({ queryKey: ["history-day-recap"] });
  };

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      invalidateHistory();
      toast.success("Support gently removed");
      (async () => {
        if (await cleanupSplitPlansForDose(base44, deletedId)) {
          queryClient.invalidateQueries({ queryKey: ["split-plans"] });
        }
      })();
    },
    onError: () => toast.error("This moment has been preserved and can't be removed.")
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
      invalidateHistory();
      toast.success("Reading gently removed");
    },
    onError: () => toast.error("This moment has been preserved and can't be removed.")
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      invalidateHistory();
      toast.success("Nourishment removed");
      (async () => {
        if (await cancelSplitPlansForMeal(base44, deletedId)) {
          queryClient.invalidateQueries({ queryKey: ["split-plans"] });
        }
      })();
    },
    onError: () => toast.error("This moment has been preserved and can't be removed.")
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
      } else {
        replaceCachedItem(queryClient, ["carb-entries"], updatedItem);
        replaceCachedItem(queryClient, ["carb-entries", "graph"], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
        queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      }

      invalidateHistory();
      toast.success("Moment updated");
      setEditingLog(null);
    },
    onError: () => toast.error("Unable to update log. It may have been preserved.")
  });

  const handleSelectMonth = (key) => {
    setDirection(1);
    setSearchParams({ month: key });
  };

  const handleSelectDay = (date, dir = 1) => {
    setDirection(dir);
    const params = {};
    if (selectedMonth) params.month = selectedMonth;
    params.day = date;
    setSearchParams(params);
    requestAnimationFrame(() => scrollToTop());
  };

  const goBack = () => {
    navigate(-1);
  };

  let headerTitle = "Your Journal";
  let headerSub = "Reflecting on your last 9 months";
  if (level === "days" && currentMonth) {
    headerTitle = `${currentMonth.label} ${currentMonth.year}`;
    const s = monthStats(currentMonth);
    const tracked = currentMonth.days.filter((d) => d.glucose.count > 0).length;
    headerSub = s.glucoseCount ?
    `${tracked} day${tracked === 1 ? "" : "s"} tracked, ${s.inRangePct}% in range` :
    tracked ?
    `${tracked} day${tracked === 1 ? "" : "s"} tracked` :
    "No moments yet";
  } else if (level === "recap" && selectedDay) {
    headerTitle = format(parseISO(selectedDay), "EEEE, MMMM d");
    headerSub = "Your day at a glance";
  }

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="space-y-6">
      <EditLogSheet
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(payload) => updateLog.mutate(payload)}
        isSaving={updateLog.isPending} />
      

      {level === "month" ?
      <PageHeader italicWord="journal" /> :

      <div className="flex items-center gap-3 px-1 pb-3">
          <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition"
          style={{ color: "#f7f1e8" }}>
          
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold truncate" style={{ color: "#f7f1e8" }}>
              {headerTitle}
            </h2>
            <p className="text-xs font-medium" style={{ color: "#f7f1e8" }}>{headerSub}</p>
          </div>
        {level === "recap" && selectedDay && allDays.length > 1 &&
        <div className="ml-auto flex items-center gap-1.5">
            <button
            type="button"
            onClick={() => {
              const sorted = [...allDays].sort((a, b) => a.date.localeCompare(b.date));
              const idx = sorted.findIndex((d) => d.date === selectedDay);
              if (idx > 0) handleSelectDay(sorted[idx - 1].date, -1);
            }}
            disabled={!allDays.some((d) => d.date < selectedDay)}
            aria-label="Previous day"
            className="flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30"
            style={{ color: "#f7f1e8" }}>
            
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
            type="button"
            onClick={() => {
              const sorted = [...allDays].sort((a, b) => a.date.localeCompare(b.date));
              const idx = sorted.findIndex((d) => d.date === selectedDay);
              if (idx < sorted.length - 1) handleSelectDay(sorted[idx + 1].date, 1);
            }}
            disabled={!allDays.some((d) => d.date > selectedDay)}
            aria-label="Next day"
            className="flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30"
            style={{ color: "#f7f1e8" }}>
            
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        }
      </div>
      }

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={level === "recap" ? "recap-" + selectedDay : level}
          custom={direction}
          initial={{ opacity: 0, x: direction > 0 ? 28 : -28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -28 : 28 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}>
          
          {level === "month" && isAdmin &&
          <SectionCard>
              <LedgerRow label="Stackd: Insight" value="Generate Reports" to="/insights" />
            </SectionCard>
          }

          {level === "month" &&
          <>
              <SectionCard label="Months Tracked">
                <HistoryMonthView months={months} onSelectMonth={handleSelectMonth} />
              </SectionCard>
              <p className="px-1 pt-2 text-xs italic text-center" style={{ color: "#f7f1e8", opacity: 0.7 }}>
                We gently hold the last 90 days of your journey.
              </p>
            </>
          }

          {level === "days" && currentMonth &&
          <>
              <div className="flex justify-center px-1 mb-4">
                <div className="inline-flex rounded-full p-1" style={{ background: "#f0e8db" }}>
                  <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
                  style={{ background: viewMode === "list" ? "#3f3830" : "transparent", color: viewMode === "list" ? "#f7f1e8" : "#6b6153" }}>
                  
                    List
                  </button>
                  <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
                  style={{ background: viewMode === "calendar" ? "#3f3830" : "transparent", color: viewMode === "calendar" ? "#f7f1e8" : "#6b6153" }}>
                  
                    Calendar
                  </button>
                </div>
              </div>

              {viewMode === "list" ?
            <HistoryWeekList
              days={monthDays}
              readingsByDay={readingsByDay}
              targetLow={targetLow}
              targetHigh={targetHigh}
              onSelectDay={handleSelectDay} /> :


            <SectionCard label={`${currentMonth.label} ${currentMonth.year}`}>
                  <MonthHeatmap days={calendarDays} onSelectDay={handleSelectDay} />
                </SectionCard>
            }
            </>
          }

          {level === "recap" && selectedDay &&
          <DayRecap
            allDays={allDays}
            daySummary={selectedDaySummary}
            glucose={recapData.glucose || []}
            carbs={recapData.carbs || []}
            insulin={recapData.insulin || []}
            loading={loadingRecap}
            dexcomConnected={dexcomConnected}
            targetLow={targetLow}
            targetHigh={targetHigh}
            onEdit={(payload) => setEditingLog(payload)}
            onDeleteDose={(id) => deleteDose.mutate(id)}
            onDeleteGlucose={(id) => deleteGlucose.mutate(id)}
            onDeleteCarb={(id) => deleteCarb.mutate(id)} />

          }
        </motion.div>
      </AnimatePresence>
    </div>);

}