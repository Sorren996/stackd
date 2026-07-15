import { format, parseISO, startOfWeek } from "date-fns";

// Groups pre-aggregated daily stats into months covering the 90-day window.
export function groupDaysByMonth(days) {
  const map = {};
  (days || []).forEach((d) => {
    const parsed = parseISO(d.date);
    if (Number.isNaN(parsed.getTime())) return;
    const key = format(parsed, "yyyy-MM");
    if (!map[key]) map[key] = { key, label: format(parsed, "MMMM"), year: parsed.getFullYear(), days: [] };
    map[key].days.push(d);
  });
  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

// Groups daily stats into ISO weeks (Monday-start) within a given set of days.
export function groupDaysByWeek(days) {
  const map = {};
  (days || []).forEach((d) => {
    const parsed = parseISO(d.date);
    if (Number.isNaN(parsed.getTime())) return;
    const ws = startOfWeek(parsed, { weekStartsOn: 1 });
    const key = format(ws, "yyyy-MM-dd");
    if (!map[key]) map[key] = { key, weekStart: ws, days: [] };
    map[key].days.push(d);
  });
  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

// Rolls up daily aggregates into a combined summary. Sums daily sums/counts so
// the resulting average is mathematically identical to averaging every raw log.
export function aggregateStats(days) {
  let gSum = 0, gCount = 0, gInRange = 0;
  let cTotal = 0, cCount = 0;
  let iTotal = 0, iCount = 0;
  (days || []).forEach((d) => {
    gSum += Number(d.glucose?.sum) || 0;
    gCount += Number(d.glucose?.count) || 0;
    gInRange += Number(d.glucose?.inRange) || 0;
    cTotal += Number(d.carbs?.total) || 0;
    cCount += Number(d.carbs?.count) || 0;
    iTotal += Number(d.insulin?.total) || 0;
    iCount += Number(d.insulin?.count) || 0;
  });
  return {
    glucoseAvg: gCount ? Math.round(gSum / gCount) : null,
    glucoseCount: gCount,
    inRangePct: gCount ? Math.round((gInRange / gCount) * 100) : null,
    carbTotal: Math.round(cTotal),
    carbCount: cCount,
    insulinTotal: Math.round(iTotal),
    insulinCount: iCount,
  };
}

export function monthStats(month) {
  return aggregateStats(month ? month.days : []);
}

export function weekStats(week) {
  return aggregateStats(week ? week.days : []);
}

export function trendSummary(month) {
  const s = monthStats(month);
  if (s.glucoseCount === 0) return "No glucose moments yet";
  if (s.inRangePct >= 80) return "Beautifully steady rhythm";
  if (s.inRangePct >= 60) return "Finding a gentle balance";
  return "Exploring your rhythm";
}