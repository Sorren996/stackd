import { filterReadingsForStats, computeTimeInRangeFromReadings } from '@/lib/timeInRange';

// Presentation eligibility only. Never promote the latest-row bootstrap to a
// day history, or extend a cached day's status into an unobserved period.
export function homeDaySummary(readings, { ready, now, targetLow, targetHigh, breakdownLow = targetLow, breakdownHigh = targetHigh }) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = filterReadingsForStats(readings).filter(r => {
    const time = Date.parse(r.recorded_at);
    return time >= start.getTime() && time <= now && Number.isFinite(Number(r.value)) && Number(r.value) > 0;
  });
  const times = today.map(r => Date.parse(r.recorded_at));
  const first = times.length ? Math.min(...times) : null;
  const last = times.length ? Math.max(...times) : null;
  const sufficient = ready && today.length >= 2 && last > first;
  const result = { readings: today, percentage: null, breakdown: null, isGathering: true, coverage: '' };
  if (!sufficient) return result;
  // Reuse the existing calculation, anchored to the last measured point, not
  // a ticking clock that would extrapolate a stale value through today's gaps.
  result.percentage = computeTimeInRangeFromReadings(today, targetLow, targetHigh, { now: last, extendToNow: false });
  const inRangeMin = today.filter(r => r.value >= breakdownLow && r.value <= breakdownHigh).length * 5;
  const aboveMin = today.filter(r => r.value > breakdownHigh).length * 5;
  const belowMin = today.filter(r => r.value < breakdownLow).length * 5;
  const fmt = m => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  result.breakdown = { inRange: fmt(inRangeMin), above: fmt(aboveMin), below: fmt(belowMin), inRangeMin, aboveMin, belowMin };
  result.isGathering = last - first < 3 * 60 * 60 * 1000;
  const time = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  result.coverage = `${today.length} saved readings · ${new Date(last).toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time(first)}–${time(last)} · As of ${time(last)}`;
  return result;
}