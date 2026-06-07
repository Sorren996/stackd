import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowRight, ArrowUpRight, ArrowDownRight, Info, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { INSULIN_PROFILES, generateActivityCurve } from "@/lib/insulinPharmacology";
import { getActiveCarbsNow, getTotalCarbsToday, generateCarbCurve } from "@/lib/carbAbsorption";
import { motion, AnimatePresence } from "framer-motion";

function getTotalActiveUnits(doses, targetTime = Date.now()) {
  const now = targetTime;
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

function getActiveCarbsAt(entries, targetTime) {
  return entries.reduce((sum, entry) => {
    if (entry.is_custom) return sum;
    const curve = generateCarbCurve(entry);
    if (!curve.length) return sum;
    if (targetTime < curve[0].time || targetTime > curve[curve.length - 1].time) return sum;
    let lo = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].time <= targetTime && curve[i + 1].time >= targetTime) { lo = i; break; }
    }
    const hi = Math.min(lo + 1, curve.length - 1);
    const ratio = hi === lo ? 0 : (targetTime - curve[lo].time) / (curve[hi].time - curve[lo].time);
    const activity = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
    return sum + activity * entry.carbs;
  }, 0);
}

function TooltipPopover({ title, description, onClose }) {
  return (
    <AnimatePresence>
      <motion.div
        key="tooltip-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.div
          key="tooltip-card"
          initial={{ opacity: 0, scale: 0.90, y: -16 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 360, damping: 26 } }}
          exit={{ opacity: 0, scale: 0.93, y: -10, transition: { duration: 0.13 } }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xs rounded-2xl p-4 border border-white/10 shadow-2xl"
          style={{ background: "hsl(162,10%,10%)" }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-white">{title}</p>
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors shrink-0 mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-white/50 leading-relaxed">{description}</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Ambient orb with breathing animation
function AmbientOrb({ color, duration = 6, size = 48 }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.18, 1], opacity: [0.15, 0.4, 0.15] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      className="rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}cc 0%, ${color}44 50%, transparent 75%)`,
        filter: `blur(8px)`,
      }}
    />
  );
}

// Glassmorphic metric card
function MetricCard({ label, value, sub, status, orbColor, orbDuration = 6, tooltipId, openTooltip, setOpenTooltip }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="relative rounded-2xl p-4 flex flex-col justify-between overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        minHeight: 100,
      }}
    >
      {/* Ambient orb background */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <AmbientOrb color={orbColor} duration={orbDuration} size={56} />
      </div>

      <div className="flex items-start justify-between mb-1">
        <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{label}</span>
        {tooltipId && (
          <button
            onClick={() => setOpenTooltip(openTooltip === tooltipId ? null : tooltipId)}
            className="text-white/20 hover:text-white/50 transition-colors"
          >
            <Info className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="mt-1">
        <span className="text-2xl font-bold text-white leading-none">{value}</span>
        {sub && <p className="text-[11px] text-white/35 mt-1">{sub}</p>}
      </div>

      <div className="mt-2">
        <span className="text-xs font-semibold" style={{ color: orbColor }}>{status}</span>
      </div>
    </motion.div>
  );
}

const TREND_ICONS = {
  "up": ArrowUp,
  "up-right": ArrowUpRight,
  "right": ArrowRight,
  "down-right": ArrowDownRight,
  "down": ArrowDown,
};

export default function ActiveInsulinBanner({ doses, latestGlucose, glucoseReadings = [], carbEntries = [] }) {
  const [openTooltip, setOpenTooltip] = useState(null);

  const activeUnits = useMemo(() => getTotalActiveUnits(doses), [doses]);
  const hasActive = activeUnits > 0.01;

  const activeCarbs = useMemo(() => getActiveCarbsNow(carbEntries), [carbEntries]);
  const totalCarbsToday = useMemo(() => getTotalCarbsToday(carbEntries), [carbEntries]);

  const futureTime = Date.now() + 60 * 60 * 1000;
  const activeUnitsFuture = useMemo(() => getTotalActiveUnits(doses, futureTime), [doses]);
  const activeCarbsFuture = useMemo(() => getActiveCarbsAt(carbEntries, futureTime), [carbEntries]);

  const netActiveCarbs = useMemo(() => {
    const currentGlucose = latestGlucose ? latestGlucose.value : 100;
    const targetGlucose = 110;
    const isf = 50;
    const activeCorrectionUnits = Math.max(0, currentGlucose - targetGlucose) / isf;
    const activeFoodUnitsFuture = Math.max(0, activeUnitsFuture - activeCorrectionUnits);
    return activeCarbsFuture - activeFoodUnitsFuture * 10;
  }, [activeCarbsFuture, activeUnitsFuture, latestGlucose]);

  const totalAdministered = useMemo(() => doses.reduce((sum, d) => sum + d.units, 0) || 1, [doses]);

  const avgDailyGlucose = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysReadings = glucoseReadings.filter((g) => new Date(g.recorded_at) >= today);
    if (!todaysReadings.length) return null;
    return Math.round(todaysReadings.reduce((acc, c) => acc + c.value, 0) / todaysReadings.length);
  }, [glucoseReadings]);

  const trendArrow = useMemo(() => {
    if (glucoseReadings.length < 2) return "right";
    const diff = glucoseReadings[0].value - glucoseReadings[1].value;
    if (diff >= 15) return "up";
    if (diff >= 9) return "up-right";
    if (diff >= -9) return "right";
    if (diff >= -15) return "down-right";
    return "down";
  }, [glucoseReadings]);

  const trendLabel = useMemo(() => {
    if (glucoseReadings.length < 2) return "Stable";
    const diff = glucoseReadings[0].value - glucoseReadings[1].value;
    if (diff >= 15) return "Rising";
    if (diff >= 9) return "Slowly Rising";
    if (diff >= -9) return "Stable";
    if (diff >= -15) return "Slowly Falling";
    return "Falling";
  }, [glucoseReadings]);

  const glucoseVal = latestGlucose?.value;
  const glucoseColor = !glucoseVal ? "#35a879" : glucoseVal < 70 ? "#3b82f6" : glucoseVal > 180 ? "#f59e0b" : "#35a879";

  // Ambient background color based on glucose state
  const ambientColor = !glucoseVal ? "#0d4a2e" : glucoseVal < 55 ? "#7f1d1d" : glucoseVal < 70 ? "#1e3a5f" : glucoseVal > 250 ? "#7c2d12" : glucoseVal > 180 ? "#78350f" : "#0d4a2e";

  const TrendIcon = TREND_ICONS[trendArrow] || ArrowRight;

  const netPct = Math.round(Math.min(100, Math.max(-100, (netActiveCarbs / 50) * 100)));
  const netLabel = netActiveCarbs > 5 ? "Rising Risk" : netActiveCarbs < -5 ? "Falling Risk" : "Balanced";
  const netColor = netActiveCarbs > 5 ? "#ef4444" : netActiveCarbs < -5 ? "#3b82f6" : "#35a879";

  const getGlucoseStatus = (val) => {
    if (!val) return "—";
    if (val < 70) return "Low";
    if (val > 180) return "High";
    return "Stable";
  };

  const hasCarbData = carbEntries.length > 0;

  // Target range check
  const targetLow = parseInt(localStorage.getItem("target_range_low") || "70", 10);
  const targetHigh = parseInt(localStorage.getItem("target_range_high") || "180", 10);
  const inRange = glucoseVal ? (glucoseVal >= targetLow && glucoseVal <= targetHigh) : null;

  return (
    <>
      <AnimatePresence>
        {openTooltip === "active-carbs" && (
          <TooltipPopover key="active-carbs-tip" title="Active Carbs"
            description="Active Carbs estimates the amount of carbohydrates currently being absorbed from recent meals. This value decreases as food absorption progresses."
            onClose={() => setOpenTooltip(null)} />
        )}
        {openTooltip === "net-carbs" && (
          <TooltipPopover key="net-carbs-tip" title="Net Active Carbs"
            description="Net Active Carbs compares carbohydrate absorption against insulin dedicated to food coverage — after accounting for correction insulin based on your current glucose level. A % accompanied by Rising Risk means carbs may be outpacing insulin (rising risk), a % accompanied by a Falling Risk means insulin may be stronger (falling risk). This tooltip is paced for 1-hour in the future."
            onClose={() => setOpenTooltip(null)} />
        )}
      </AnimatePresence>

      <div className="pt-2 pb-6 -mx-4 px-4">
        {/* Ambient breathing background orb */}
        <div className="absolute left-1/2 -translate-x-1/2 top-16 w-72 h-72 pointer-events-none -z-10 overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-full h-full rounded-full"
            style={{
              background: `radial-gradient(circle, ${ambientColor} 0%, transparent 70%)`,
              filter: "blur(16px)",
            }}
          />
        </div>

        {/* ── Primary Glucose Hero ── */}
        <div className="flex flex-col items-center text-center mb-6 pt-2 overflow-hidden">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3">Current Glucose</span>

          <motion.div
            key={glucoseVal}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="flex items-end gap-3 mb-1"
          >
            <span className="text-[72px] sm:text-[88px] font-black leading-none tracking-tight text-white">
              {glucoseVal ?? "—"}
            </span>
            {latestGlucose && (
              <TrendIcon className="w-8 h-8 mb-3 shrink-0" style={{ color: glucoseColor }} />
            )}
          </motion.div>

          <span className="text-sm text-white/35 font-medium mb-4">mg/dL</span>

          {/* Status capsule */}
          <motion.div
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: `${glucoseColor}18`,
              border: `1px solid ${glucoseColor}40`,
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: glucoseColor }} />
            <span className="text-sm font-semibold" style={{ color: glucoseColor }}>{trendLabel}</span>
          </motion.div>
        </div>

        {/* ── Target Range Banner ── */}
        {latestGlucose && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl px-4 py-3 flex items-center gap-3 mb-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex gap-0.5 items-end h-5 shrink-0">
              {[3,4,3,5,4,3,4,5,3].map((h, i) => (
                <div key={i} className="w-0.5 rounded-full" style={{
                  height: h * 3,
                  backgroundColor: inRange ? "#35a87988" : "#f59e0b88"
                }} />
              ))}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white/80">
                {inRange === null ? "No data" : inRange ? "In range" : "Out of range"}
              </p>
              <p className="text-xs text-white/35">Target: {targetLow} – {targetHigh} mg/dL</p>
            </div>
            <span className="text-xs font-medium" style={{ color: inRange ? "#35a879" : "#f59e0b" }}>
              {inRange === null ? "" : inRange ? "✓" : "↑"}
            </span>
          </motion.div>
        )}

        {/* ── Metric Cards Grid ── */}
        {hasCarbData ? (
          <>
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.18em] mb-3">At a Glance</p>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Active Insulin"
                value={`${activeUnits.toFixed(1)}`}
                sub="units"
                status={hasActive ? "Active" : "Cleared"}
                orbColor="#06b6d4"
                orbDuration={6}
              />
              <MetricCard
                label="Active Carbs"
                value={activeCarbs > 0 ? `${Math.round(activeCarbs)}g` : "0g"}
                sub={`${totalCarbsToday}g today`}
                status={activeCarbs > 0 ? "Absorbing" : "Cleared"}
                orbColor="#f59e0b"
                orbDuration={activeCarbs > 0 ? 4 : 8}
                tooltipId="active-carbs"
                openTooltip={openTooltip}
                setOpenTooltip={setOpenTooltip}
              />
              <MetricCard
                label="Net Carbs"
                value={`${Math.abs(netPct)}%`}
                sub="balance"
                status={netLabel}
                orbColor={netColor}
                orbDuration={8}
                tooltipId="net-carbs"
                openTooltip={openTooltip}
                setOpenTooltip={setOpenTooltip}
              />
              <MetricCard
                label="Daily Average"
                value={avgDailyGlucose ? `${avgDailyGlucose}` : "—"}
                sub={avgDailyGlucose ? "mg/dL" : "No data today"}
                status={getGlucoseStatus(avgDailyGlucose)}
                orbColor={!avgDailyGlucose ? "#35a879" : avgDailyGlucose < 70 ? "#3b82f6" : avgDailyGlucose > 180 ? "#f59e0b" : "#10b981"}
                orbDuration={9}
              />
            </div>
          </>
        ) : (
          /* No carb data: just 2 cards */
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Active Insulin"
              value={`${activeUnits.toFixed(1)}`}
              sub="units"
              status={hasActive ? "Active" : "Cleared"}
              orbColor="#06b6d4"
              orbDuration={6}
            />
            <MetricCard
              label="Daily Average"
              value={avgDailyGlucose ? `${avgDailyGlucose}` : "—"}
              sub={avgDailyGlucose ? "mg/dL" : "No data today"}
              status={getGlucoseStatus(avgDailyGlucose)}
              orbColor={!avgDailyGlucose ? "#35a879" : avgDailyGlucose < 70 ? "#3b82f6" : avgDailyGlucose > 180 ? "#f59e0b" : "#10b981"}
              orbDuration={9}
            />
          </div>
        )}
      </div>
    </>
  );
}