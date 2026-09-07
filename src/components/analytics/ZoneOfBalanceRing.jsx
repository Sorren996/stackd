import { motion } from "framer-motion";
import { WELLNESS_COLORS } from "@/lib/glassTheme";
import NotEnoughData from "@/components/analytics/NotEnoughData";

const COLORS = {
  inRange: WELLNESS_COLORS.inRange,
  above: WELLNESS_COLORS.above,
  below: WELLNESS_COLORS.below,
};

function BreakdownItem({ value, label, color }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-sm font-bold tracking-tight" style={{ color: `${color}cc` }}>{value}%</span>
      <span className="text-[8px] uppercase tracking-[0.10em] text-white/25">{label}</span>
    </div>
  );
}

export default function ZoneOfBalanceRing({ inRangePercent, abovePercent, belowPercent, totalReadings, comparisons, rangeDays, hasEnough = true }) {
  if (!hasEnough) {
    return (
      <div className="relative z-10 flex flex-col items-center">
        <NotEnoughData />
      </div>
    );
  }

  const radius = 77;
  const circumference = 2 * Math.PI * radius;

  const belowArc = (belowPercent / 100) * circumference;
  const inRangeArc = (inRangePercent / 100) * circumference;
  const aboveArc = (abovePercent / 100) * circumference;

  const inRangeOffset = -belowArc;
  const aboveOffset = -(belowArc + inRangeArc);

  return (
    <div className="relative z-10 flex flex-col items-center">
      {/* Donut + percentage */}
      <div className="relative mt-3">
        <svg width="196" height="196" viewBox="0 0 196 196" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="98" cy="98" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="16" />
          {belowPercent > 0 && (
            <motion.circle
              cx="98" cy="98" r={radius} fill="none"
              stroke={COLORS.below}
              strokeWidth="16"
              strokeDasharray={`${belowArc} ${circumference - belowArc}`}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          )}
          {inRangePercent > 0 && (
            <motion.circle
              cx="98" cy="98" r={radius} fill="none"
              stroke={COLORS.inRange}
              strokeWidth="16"
              strokeDasharray={`${inRangeArc} ${circumference - inRangeArc}`}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: inRangeOffset }}
              transition={{ duration: 1, delay: 0.15, ease: "easeOut" }}
              style={{ filter: "drop-shadow(0 0 3px rgba(91,168,138,0.12))" }}
            />
          )}
          {abovePercent > 0 && (
            <motion.circle
              cx="98" cy="98" r={radius} fill="none"
              stroke={COLORS.above}
              strokeWidth="16"
              strokeDasharray={`${aboveArc} ${circumference - aboveArc}`}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: aboveOffset }}
              transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="text-[2.5rem] font-black leading-none tracking-tight text-white"
          >
            {Math.round(inRangePercent)}%
          </motion.span>
          <span className="mt-1 text-[10px] text-white/35">In comfort zone</span>
          {comparisons?.inRangePercent && (
            <span
              className="mt-0.5 text-[9px] font-medium"
              style={{ color: comparisons.inRangePercent.color }}
            >
              {comparisons.inRangePercent.text}
            </span>
          )}
        </div>
      </div>

      {/* Three-part breakdown */}
      <div className="mt-4 flex w-full items-center justify-center gap-6">
        <BreakdownItem value={Math.round(belowPercent)} label="Below" color={COLORS.below} />
        <BreakdownItem value={Math.round(inRangePercent)} label="In range" color={COLORS.inRange} />
        <BreakdownItem value={Math.round(abovePercent)} label="Above" color={COLORS.above} />
      </div>
    </div>
  );
}