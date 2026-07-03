import { motion } from "framer-motion";
import { GLASS_SURFACE, WELLNESS_COLORS } from "@/lib/glassTheme";

const COLORS = {
  inRange: WELLNESS_COLORS.inRange,
  above: WELLNESS_COLORS.above,
  below: WELLNESS_COLORS.below,
};

function getTIRMessages(inRangePercent) {
  if (inRangePercent >= 80) {
    return [
      "Your body is finding its rhythm beautifully. What a gift to yourself.",
      "You're flowing with such grace. The river of your days is steady and clear.",
      "What a beautiful balance you've found. Your routine is nurturing you well.",
    ];
  }
  if (inRangePercent >= 60) {
    return [
      "You're navigating with real intention. The balance is growing steadier each day.",
      "The trail is becoming familiar beneath your feet. Keep going — you're finding your way.",
      "Your body is learning its rhythm. Each day brings more clarity to the path.",
    ];
  }
  if (inRangePercent >= 40) {
    return [
      "Every reading is a step of awareness. You're learning your body's language.",
      "The forest path winds, but you're walking it with care. Each step matters.",
      "Awareness is the first gift. You're showing up for yourself, and that's beautiful.",
    ];
  }
  return [
    "This journey takes patience. Each moment of awareness is a quiet victory.",
    "The river finds its way, even through the steepest terrain. So will you.",
    "Be gentle with yourself. Every reading is an act of care, not a measure of worth.",
  ];
}

function pickMessage(messages, seed) {
  const hash = String(seed || "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return messages[hash % messages.length];
}

function LegendItem({ color, label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[10px] uppercase tracking-wider text-white/35">{label}</span>
      <span className="text-[10px] font-bold text-white/70">{value}</span>
    </div>
  );
}

export default function ZoneOfBalanceRing({ inRangePercent, abovePercent, belowPercent, totalReadings, averageGlucose, targetLow, targetHigh }) {
  const radius = 72;
  const circumference = 2 * Math.PI * radius;

  const belowArc = (belowPercent / 100) * circumference;
  const inRangeArc = (inRangePercent / 100) * circumference;
  const aboveArc = (abovePercent / 100) * circumference;

  const inRangeOffset = -belowArc;
  const aboveOffset = -(belowArc + inRangeArc);

  const message = pickMessage(getTIRMessages(inRangePercent), String(totalReadings));

  return (
    <div className="relative overflow-hidden rounded-3xl border p-6" style={GLASS_SURFACE}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-50"
        style={{ background: "radial-gradient(circle at 50% 0%, rgba(53,168,121,0.12), transparent 60%)" }}
      />
      <div className="relative z-10 flex flex-col items-center">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Time in Your Comfort Zone</p>
        <p className="mb-5 text-xs text-white/30">Last 30 days · {totalReadings} readings</p>

        <div className="relative">
          <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
            {belowPercent > 0 && (
              <motion.circle
                cx="90" cy="90" r={radius} fill="none"
                stroke={COLORS.below}
                strokeWidth="14"
                strokeDasharray={`${belowArc} ${circumference - belowArc}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            )}
            {inRangePercent > 0 && (
              <motion.circle
                cx="90" cy="90" r={radius} fill="none"
                stroke={COLORS.inRange}
                strokeWidth="14"
                strokeDasharray={`${inRangeArc} ${circumference - inRangeArc}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: inRangeOffset }}
                transition={{ duration: 1, delay: 0.15, ease: "easeOut" }}
              />
            )}
            {abovePercent > 0 && (
              <motion.circle
                cx="90" cy="90" r={radius} fill="none"
                stroke={COLORS.above}
                strokeWidth="14"
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
            <span className="text-[10px] uppercase tracking-wider text-white/40">in balance</span>
          </div>
        </div>

        <div className="mt-5 flex gap-4">
          <LegendItem color={COLORS.below} label="Below" value={`${Math.round(belowPercent)}%`} />
          <LegendItem color={COLORS.inRange} label="In Balance" value={`${Math.round(inRangePercent)}%`} />
          <LegendItem color={COLORS.above} label="Above" value={`${Math.round(abovePercent)}%`} />
        </div>

        {Number.isFinite(averageGlucose) && (
          <div className="mt-5 text-center">
            <p className="text-2xl font-bold text-white">
              {Math.round(averageGlucose)}
              <span className="ml-1 text-sm font-normal text-white/40">mg/dL avg</span>
            </p>
            <p className="mt-0.5 text-[10px] text-white/30">Target: {targetLow}–{targetHigh} mg/dL</p>
          </div>
        )}

        <p className="mt-4 max-w-[280px] text-center text-[13px] font-medium italic leading-relaxed text-white/50">
          "{message}"
        </p>
      </div>
    </div>
  );
}