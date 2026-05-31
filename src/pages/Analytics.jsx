import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useMemo } from "react";
import { subDays, format, startOfDay, getDay, parseISO, differenceInDays } from "date-fns";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LineChart, Line, Legend,
} from "recharts";
import { TrendingUp, Syringe, Calendar, Activity } from "lucide-react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#6366F1", "#14B8A6", "#0EA5E9"];

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
      <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Analytics() {
  const { data: doses = [], isLoading } = useQuery({
    queryKey: ["insulin-doses-analytics"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 500),
  });

  const stats = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    const recent = doses.filter((d) => new Date(d.administered_at) >= cutoff);

    if (!recent.length) return null;

    // Days with at least 1 dose (to compute daily average)
    const daySet = new Set(recent.map((d) => format(parseISO(d.administered_at), "yyyy-MM-dd")));
    const activeDays = daySet.size;
    const totalUnits = recent.reduce((s, d) => s + (d.units || 0), 0);
    const avgUnitsPerDay = activeDays ? (totalUnits / activeDays).toFixed(1) : 0;
    const avgDosesPerDay = activeDays ? (recent.length / activeDays).toFixed(1) : 0;

    // Weekly pattern: avg units per day-of-week
    const byDow = Array.from({ length: 7 }, (_, i) => ({ day: DAY_NAMES[i], units: 0, count: 0 }));
    recent.forEach((d) => {
      const dow = getDay(parseISO(d.administered_at));
      byDow[dow].units += d.units || 0;
      byDow[dow].count += 1;
    });
    const weeklyPattern = byDow.map((d) => ({
      day: d.day,
      avgUnits: d.count ? Math.round((d.units / d.count) * 10) / 10 : 0,
      doses: d.count,
    }));

    // Daily totals over 30 days for trend line
    const dailyMap = {};
    recent.forEach((d) => {
      const key = format(parseISO(d.administered_at), "yyyy-MM-dd");
      if (!dailyMap[key]) dailyMap[key] = { units: 0, doses: 0 };
      dailyMap[key].units += d.units || 0;
      dailyMap[key].doses += 1;
    });
    const dailyTrend = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      const key = format(date, "yyyy-MM-dd");
      return {
        date: format(date, "MMM d"),
        units: dailyMap[key]?.units || 0,
        doses: dailyMap[key]?.doses || 0,
      };
    });

    // By insulin type
    const typeMap = {};
    recent.forEach((d) => {
      if (!typeMap[d.insulin_type]) typeMap[d.insulin_type] = { units: 0, doses: 0 };
      typeMap[d.insulin_type].units += d.units || 0;
      typeMap[d.insulin_type].doses += 1;
    });
    const byType = Object.entries(typeMap)
      .map(([type, v]) => ({ type, ...v, color: INSULIN_PROFILES[type]?.color || "#888" }))
      .sort((a, b) => b.units - a.units);

    return { recent, activeDays, totalUnits, avgUnitsPerDay, avgDosesPerDay, weeklyPattern, dailyTrend, byType };
  }, [doses]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <h3 className="text-lg font-semibold text-white">No data yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Log some doses to see your patterns here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Weekly Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Patterns and averages over the last 30 days</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Syringe} label="Avg units / day" value={`${stats.avgUnitsPerDay}u`} sub={`${stats.activeDays} active days`} />
        <StatCard icon={Activity} label="Avg doses / day" value={stats.avgDosesPerDay} sub="on days with doses" />
        <StatCard icon={TrendingUp} label="Total units" value={`${stats.totalUnits}u`} sub="last 30 days" />
        <StatCard icon={Calendar} label="Total doses" value={stats.recent.length} sub="last 30 days" />
      </div>

      {/* Weekly pattern */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-semibold text-white mb-4">Average Units by Day of Week</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.weeklyPattern} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "hsl(215,15%,50%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215,15%,50%)" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${v}u`, "Avg units"]}
                contentStyle={{ background: "hsl(211,34%,17%)", border: "1px solid hsl(214,20%,90%)", borderRadius: 12 }}
                labelStyle={{ color: "#fff", fontSize: 12 }}
              />
              <Bar dataKey="avgUnits" radius={[6, 6, 0, 0]}>
                {stats.weeklyPattern.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={entry.avgUnits > 0 ? 1 : 0.2} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 30-day trend */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-semibold text-white mb-4">Daily Units — 30-Day Trend</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.dailyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215,15%,50%)" }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215,15%,50%)" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${v}u`, "Units"]}
                contentStyle={{ background: "hsl(211,34%,17%)", border: "1px solid hsl(214,20%,90%)", borderRadius: 12 }}
                labelStyle={{ color: "#fff", fontSize: 12 }}
              />
              <Line type="monotone" dataKey="units" stroke="#3B82F6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* By insulin type */}
      {stats.byType.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-base font-semibold text-white mb-4">Breakdown by Insulin Type</h2>
          <div className="space-y-3">
            {stats.byType.map((t) => (
              <div key={t.type} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white truncate">{t.type}</span>
                    <span className="text-muted-foreground ml-2 shrink-0">{t.units}u · {t.doses} doses</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(t.units / stats.totalUnits) * 100}%`, backgroundColor: t.color }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}