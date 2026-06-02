import { useMemo } from "react";
import { INSULIN_PROFILES, generateActivityCurve, getDoseStatus, formatMinutes } from "@/lib/insulinPharmacology";

function getTotalActiveUnits(doses) {
  const now = Date.now();
  return doses.reduce((sum, dose) => {
    const curve = generateActivityCurve(dose, 3);
    if (!curve.length) return sum;
    const last = curve[curve.length - 1];
    const first = curve[0];
    if (now < first.time || now > last.time) return sum;
    let lo = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].time <= now && curve[i + 1].time >= now) { lo = i; break; }
    }
    const hi = lo + 1;
    const ratio = hi >= curve.length ? 0 : (now - curve[lo].time) / (curve[hi].time - curve[lo].time);
    const activity = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
    return sum + activity * dose.units;
  }, 0);
}

function getMaxRemainingTime(doses) {
  const now = Date.now();
  let maxMs = 0;
  doses.forEach((dose) => {
    const profile = INSULIN_PROFILES[dose.insulin_type];
    if (!profile) return;
    const administered = new Date(dose.administered_at).getTime();
    const end = administered + profile.durationMin * 60000;
    if (end > now) maxMs = Math.max(maxMs, end - now);
  });
  return maxMs;
}

function formatRemaining(ms) {
  if (!ms) return null;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m remaining`;
  if (h > 0) return `${h}h remaining`;
  return `${m}m remaining`;
}

export default function ActiveInsulinBanner({ doses, latestGlucose, glucoseReadings = [] }) {
  const activeUnits = useMemo(() => getTotalActiveUnits(doses), [doses]);
  const remainingMs = useMemo(() => getMaxRemainingTime(doses), [doses]);
  const remainingLabel = formatRemaining(remainingMs);
  const hasActive = activeUnits > 0.01;

  const avgDailyGlucose = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysReadings = glucoseReadings.filter(g => new Date(g.recorded_at) >= today);
    if (!todaysReadings.length) return null;
    const sum = todaysReadings.reduce((acc, curr) => acc + curr.value, 0);
    return Math.round(sum / todaysReadings.length);
  }, [glucoseReadings]);

  const r = 72;
  const cx = 96;
  const cy = 96;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, activeUnits / Math.max(1, doses.reduce((s, d) => s + d.units, 0)));

  const renderIndicator = (label, val) => {
    if (val === null || val === undefined) return null;
    const color = val < 70 ? "#ef4444" : val > 180 ? "#f97316" : "#4ade80";
    const statusLabel = val < 70 ? "Low" : val > 180 ? "High" : "In Range";
    return (
      <div className="flex flex-col items-center" style={{ minWidth: 72 }}>
        <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">{label}</span>
        <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 22 * Math.min(1, (val - 40) / 360)} ${2 * Math.PI * 22}`}
              strokeDashoffset={2 * Math.PI * 22 * 0.25}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
              transform="rotate(-90 28 28)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold leading-none" style={{ color }}>{val}</span>
            <span className="text-[8px] text-white/30 mt-0.5">mg/dL</span>
          </div>
        </div>
        <span className="text-[9px] font-bold mt-1.5" style={{ color }}>{statusLabel}</span>
      </div>
    );
  };

  return (
    <div
      className="-mx-4 md:mx-0 rounded-none md:rounded-3xl p-5 flex flex-col gap-5 relative overflow-hidden border-0 md:border md:border-white/5 shadow-xl"
      style={{ background: "linear-gradient(145deg, hsl(162,14%,11%) 0%, hsl(162,12%,8%) 100%)" }}>

      {/* Title & Glucose row */}
      <div className="flex flex-row items-start justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
          {remainingLabel && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">{remainingLabel}</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-4">
          {latestGlucose && renderIndicator("Last Reading", latestGlucose.value)}
          {avgDailyGlucose !== null && renderIndicator("Daily Average", avgDailyGlucose)}
        </div>
      </div>

      {/* Active Insulin Section */}
      <div>
        <h2 className="text-white/50 font-semibold text-xs uppercase tracking-widest mb-3">Active Insulin</h2>
        <div className="flex items-center gap-6">
          <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
            <svg width="192" height="192" viewBox="0 0 192 192" style={{ width: 120, height: 120 }}>
              <defs>
                <filter id="arcglow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id="arcgrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(162,50%,42%)" />
                  <stop offset="100%" stopColor="hsl(195,60%,50%)" />
                </linearGradient>
              </defs>
              <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                strokeDashoffset={circumference * 0.125}
                strokeLinecap="round"
                transform={`rotate(135 ${cx} ${cy})`}
              />
              {hasActive && (
                <circle
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke="url(#arcgrad)"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${circumference * 0.75 * progress} ${circumference}`}
                  strokeDashoffset={circumference * 0.125}
                  strokeLinecap="round"
                  transform={`rotate(135 ${cx} ${cy})`}
                  filter="url(#arcglow)"
                  style={{ transition: "stroke-dasharray 0.6s ease" }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white leading-none">
                {activeUnits.toFixed(2)}<span className="text-base font-medium">u</span>
              </span>
              <span className="text-[10px] text-white/40 mt-0.5">{hasActive ? "Currently Active" : "No Active Insulin"}</span>
            </div>
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            {doses.filter((dose) => getDoseStatus(dose).phase !== "expired").slice(0, 4).map((dose) => {
              const profile = INSULIN_PROFILES[dose.insulin_type];
              const status = getDoseStatus(dose);
              const isExpired = status.phase === "expired";
              return (
                <div key={dose.id} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isExpired ? "#555" : profile?.color || "#888" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/80 truncate">{dose.insulin_type.split(" ")[0]}</p>
                    <p className="text-[10px] text-white/40">{dose.units}u · {formatMinutes((Date.now() - new Date(dose.administered_at).getTime()) / 60000)} ago</p>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ${isExpired ? "text-white/20" : "text-white/50"}`}>
                    {isExpired ? "done" : status.message.split("—")[0].trim()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}