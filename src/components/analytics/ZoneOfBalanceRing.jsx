import { motion } from "framer-motion";
import { Check, TrendingUp, Activity } from "lucide-react";
import { WELLNESS_COLORS } from "@/lib/glassTheme";

const COLORS = {
  inRange: WELLNESS_COLORS.inRange,
  above: WELLNESS_COLORS.above,
  below: WELLNESS_COLORS.below,
};

const CARD_SURFACE = {
  background: "linear-gradient(152deg, rgba(255,255,255,0.035), rgba(255,255,255,0.006))",
  borderColor: "rgba(255,255,255,0.08)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.10), inset 0 1px 1px rgba(255,255,255,0.08)",
  backdropFilter: "blur(4px)",
};

function getInsight(inRangePercent) {
  const pct = Math.round(inRangePercent);
  if (inRangePercent >= 70) {
    return {
      icon: Check,
      title: "Strong consistency",
      message: `${pct}% of readings stayed within your comfort zone over the last 30 days.`,
      color: COLORS.inRange,
    };
  }
  if (inRangePercent >= 50) {
    return {
      icon: TrendingUp,
      title: "Building consistency",
      message: `Your readings spent more time in range than outside it — ${pct}% over the last 30 days.`,
      color: COLORS.above,
    };
  }
  return {
    icon: Activity,
    title: "More variability recently",
    message: `A larger share of readings fell outside your comfort zone. ${pct}% stayed in range over the last 30 days.`,
    color: COLORS.below,
  };
}

function LegendItem({ color, label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[9px] uppercase tracking-wider text-white/35">{label}</span>
      <span className="text-[11px] font-bold text-white/80">{value}</span>
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className="text-[13px] font-semibold text-white/90">{value}</span>
    </div>
  );
}

export default function ZoneOfBalanceRing({ inRangePercent, abovePercent, belowPercent, totalReadings, averageGlucose, estimatedA1c, targetLow, targetHigh, rangeDays, onRangeChange }) {
  const radius = 68;
  const circumference = 2 * Math.PI * radius;

  const belowArc = (belowPercent / 100) * circumference;
  const inRangeArc = (inRangePercent / 100) * circumference;
  const aboveArc = (abovePercent / 100) * circumference;

  const inRangeOffset = -belowArc;
  const aboveOffset = -(belowArc + inRangeArc);

  const insight = getInsight(inRangePercent);
  const InsightIcon = insight.icon;

  return (
    <div className="relative overflow-hidden rounded-3xl border p-5" style={CARD_SURFACE}>
      {/* centered ambient glow behind the donut */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-16 flex justify-center"
      >
        <div
          className="h-44 w-44 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(53,168,121,0.10) 0%, rgba(53,168,121,0.03) 45%, transparent 70%)",
            filter: "blur(6px)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* header group */}
        <div className="flex flex-col items-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white">Time in Your Comfort Zone</p>
          <p className="mt-0.5 text-[11px] text-white/30">Last {rangeDays} days</p>
        </div>

        {/* donut hero */}
        <div className="relative mt-3">
          <svg width="172" height="172" viewBox="0 0 172 172" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="86" cy="86" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="13" />
            {belowPercent > 0 && (
              <motion.circle
                cx="86" cy="86" r={radius} fill="none"
                stroke={COLORS.below}
                strokeWidth="13"
                strokeDasharray={`${belowArc} ${circumference - belowArc}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            )}
            {inRangePercent > 0 && (
              <motion.circle
                cx="86" cy="86" r={radius} fill="none"
                stroke={COLORS.inRange}
                strokeWidth="13"
                strokeDasharray={`${inRangeArc} ${circumference - inRangeArc}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: inRangeOffset }}
                transition={{ duration: 1, delay: 0.15, ease: "easeOut" }}
              />
            )}
            {abovePercent > 0 && (
              <motion.circle
                cx="86" cy="86" r={radius} fill="none"
                stroke={COLORS.above}
                strokeWidth="13"
                strokeDasharray={`${aboveArc} ${circumference - aboveArc}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: aboveOffset }}
                transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="text-4xl font-black text-white"
            >
              {Math.round(inRangePercent)}%
            </motion.span>
            <span className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-white/40">In comfort zone</span>
          </div>
        </div>

        {/* distribution row */}
        <div className="mt-4 flex w-full items-center justify-center gap-4">
          <LegendItem color={COLORS.below} label="Below" value={`${Math.round(belowPercent)}%`} />
          <LegendItem color={COLORS.inRange} label="In range" value={`${Math.round(inRangePercent)}%`} />
          <LegendItem color={COLORS.above} label="Above" value={`${Math.round(abovePercent)}%`} />
        </div>

        {/* subtle divider */}
        <div className="my-4 h-px w-full" style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)" }} />

        {/* secondary metrics */}
        <div className="w-full space-y-2">
          {Number.isFinite(averageGlucose) && (
            <MetricRow label="Average glucose" value={`${Math.round(averageGlucose)} mg/dL`} />
          )}
          {Number.isFinite(estimatedA1c) && (
            <MetricRow label="Est. A1C (90-day)" value={`${estimatedA1c.toFixed(1)}%`} />
          )}
          <MetricRow label="Target range" value={`${targetLow}–${targetHigh} mg/dL`} />
        </div>

        {/* data-connected insight */}
        <div className="mt-4 flex w-full items-start gap-2.5">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${insight.color}1a`, color: insight.color }}
          >
            <InsightIcon className="h-3 w-3" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-bold" style={{ color: insight.color }}>{insight.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">{insight.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}