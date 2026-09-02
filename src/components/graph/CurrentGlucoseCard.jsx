import { useRef, useEffect } from "react";
import { ArrowUp, ArrowUpRight, ArrowRight, ArrowDownRight, ArrowDown, Droplet } from "lucide-react";
import { motion } from "framer-motion";
import GlucoseTicker from "./GlucoseTicker";
import { formatReadingAge } from "@/lib/glucoseStaleness";

const TREND_ICONS = {
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
};

const CARD_STYLE = {
  background: "linear-gradient(152deg, rgba(255,255,255,0.04), rgba(255,255,255,0.008))",
  borderColor: "rgba(255,255,255,0.09)",
  boxShadow:
    "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.10), inset 0 0 28px rgba(91,168,138,0.025)",
};

const STALE_COLOR = "rgba(255,255,255,0.3)";
const STALE_LABEL = "Waiting for a fresh reading";

function AmbientOrb({ color, duration = 6, dimmed = false }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.18, 1], opacity: dimmed ? [0.18, 0.28, 0.18] : [0.45, 0.7, 0.45] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      className="h-14 w-14 rounded-full"
      style={{
        background: `radial-gradient(circle, ${color}cc 0%, ${color}44 50%, transparent 75%)`,
        filter: "blur(8px)",
      }}
    />
  );
}

export default function CurrentGlucoseCard({
  latestGlucose,
  glucoseValue,
  glucoseColor,
  trend,
  rangeCardLabel,
  readingAgeLabel,
  onEdit,
  isStale = false,
}) {
  const tickerRef = useRef(null);
  const TrendIcon = TREND_ICONS[trend?.icon] || ArrowRight;

  const displayColor = isStale ? STALE_COLOR : glucoseColor;
  const displayLabel = isStale ? STALE_LABEL : rangeCardLabel;
  const staleAge = isStale ? formatReadingAge(latestGlucose?.recorded_at) : null;

  useEffect(() => {
    if (tickerRef.current && glucoseValue != null && !isStale) {
      tickerRef.current.setValue(String(glucoseValue), true);
    }
  }, [glucoseValue, isStale]);

  return (
    <motion.div
      className="metric-card relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={CARD_STYLE}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-50"
        style={{
          background:
            "radial-gradient(circle at 30% 0%, rgba(91,168,138,0.07), transparent 50%), radial-gradient(circle at 90% 100%, rgba(255,255,255,0.05), transparent 45%)",
        }}
      />
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <AmbientOrb color={displayColor} dimmed={isStale} />
      </div>
      <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
          Current Glucose
        </span>
        <Droplet className="h-3.5 w-3.5" style={{ color: "rgba(91,168,138,0.6)" }} />
      </div>

      <div className="relative z-10 mt-1 flex items-end gap-1.5">
        {isStale ? (
          <span className="text-4xl font-black leading-none text-white/45">--</span>
        ) : glucoseValue != null ? (
          <GlucoseTicker
            ref={tickerRef}
            initialValue={String(glucoseValue)}
            className="text-4xl font-black leading-none text-white"
          />
        ) : (
          <span className="text-4xl font-black leading-none text-white">--</span>
        )}
        <span className="mb-1 text-[11px] font-medium text-white/40">mg/dL</span>
        {latestGlucose && !isStale && (
          <TrendIcon className="mb-1 h-4 w-4" style={{ color: displayColor }} />
        )}
      </div>

      <div className="relative z-10 mt-1">
        {readingAgeLabel && !isStale && (
          <p className="text-[11px] text-white/35">{readingAgeLabel}</p>
        )}
        {isStale && staleAge && (
          <p className="text-[11px] text-white/35">Last reading {staleAge}</p>
        )}
        <span
          className="mt-1.5 block text-xs font-semibold"
          style={{ color: displayColor }}
        >
          {displayLabel}
        </span>
      </div>
    </motion.div>
  );
}