import { useRef, useEffect, useState } from "react";
import { ArrowUp, ArrowUpRight, ArrowRight, ArrowDownRight, ArrowDown, ChevronsUp, ChevronsDown, Droplet } from "lucide-react";
import { motion } from "framer-motion";
import GlucoseTicker from "./GlucoseTicker";
import { formatReadingAge } from "@/lib/glucoseStaleness";

const TREND_ICONS = {
  "double_up": ChevronsUp,
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
  "double_down": ChevronsDown
};

const CARD_STYLE = {
  borderColor: "#eadccf",
  boxShadow: "none"
};

const STALE_COLOR = "#746959";
const STALE_LABEL = "Waiting for a fresh reading";

export default function CurrentGlucoseCard({
  latestGlucose,
  glucoseValue,
  glucoseColor,
  trend,
  rangeCardLabel,
  readingAgeLabel,
  onEdit,
  isStale = false
}) {
  const tickerRef = useRef(null);
  const TrendIcon = TREND_ICONS[trend?.icon] || ArrowRight;

  const displayColor = isStale ? STALE_COLOR : glucoseColor;
  const displayLabel = isStale ? STALE_LABEL : rangeCardLabel;
  const staleAge = isStale ? formatReadingAge(latestGlucose?.recorded_at) : null;

  // Local "x minutes ago / just now" label for this card only — computed from
  // the reading's timestamp and the current time, refreshed every 30s so it
  // stays accurate without affecting any other element that uses readingAgeLabel.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const freshAgeLabel = (() => {
    const recordedAt = latestGlucose?.recorded_at;
    if (!recordedAt) return null;
    const mins = Math.max(0, Math.round((now - new Date(recordedAt).getTime()) / 60000));
    if (mins < 1) return "just now";
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  })();

  useEffect(() => {
    if (tickerRef.current && glucoseValue != null && !isStale) {
      tickerRef.current.setValue(String(glucoseValue), true);
    }
  }, [glucoseValue, isStale]);

  return (
    <motion.div
      className="relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl p-4"
      style={{ background: "transparent", border: "none", boxShadow: "none" }}>

      <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>
          Current Glucose
        </span>
        
      </div>

      <div className="relative z-10 mt-1 flex items-end gap-1.5">
        {isStale ?
        <span className="text-4xl font-black leading-none" style={{ color: "#746959" }}>--</span> :
        glucoseValue != null ?
        <GlucoseTicker
          ref={tickerRef}
          initialValue={String(glucoseValue)}
          className="text-4xl font-black leading-none"
          style={{ color: "#3f3830" }} /> :


        <span className="text-4xl font-black leading-none" style={{ color: "#3f3830" }}>--</span>
        }
        <span className="mb-1 text-[11px] font-medium" style={{ color: "#746959" }}>mg/dL</span>
        {latestGlucose && !isStale &&
        <TrendIcon className="self-center h-6 w-6" style={{ color: "#3f3830" }} />
        }
      </div>

      <div className="relative z-10 mt-1">
        {freshAgeLabel && !isStale &&
        <p className="text-[11px]" style={{ color: "#746959" }}>{freshAgeLabel}</p>
        }
        {isStale && staleAge &&
        <p className="text-[11px]" style={{ color: "#746959" }}>Last reading {staleAge}</p>
        }


      </div>
    </motion.div>);

}