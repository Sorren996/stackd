import { useState } from "react";
import { ArrowUp, ArrowUpRight, ArrowRight, ArrowDownRight, ArrowDown, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import InfoPopover from "./InfoPopover";

const TREND_ICONS = {
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
};

const CARD_STYLE = {
  background: "linear-gradient(160deg, rgba(12,20,16,0.86), rgba(8,14,11,0.80))",
  borderColor: "rgba(255,255,255,0.14)",
  boxShadow:
    "0 14px 40px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.18), inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -1px 1px rgba(255,255,255,0.04)",
};

export default function CurrentGlucoseCard({
  latestGlucose,
  glucoseValue,
  glucoseColor,
  trend,
  rangeCardLabel,
  readingAgeLabel,
  onEdit,
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const TrendIcon = TREND_ICONS[trend?.icon] || ArrowRight;

  const openPopover = (e) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setOpen(true);
  };

  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98 }}
        role="button"
        tabIndex={0}
        onClick={openPopover}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPopover(e);
          }
        }}
        className="metric-card relative flex min-h-[112px] cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
        style={CARD_STYLE}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 92% 118%, rgba(45,212,191,0.08), transparent 42%)",
          }}
        />
        <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Current Glucose
          </span>
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: glucoseColor }}
          />
        </div>

        <div className="relative z-10 mt-1 flex items-end gap-1.5">
          <span className="text-2xl font-bold leading-none text-white">
            {glucoseValue ?? "--"}
          </span>
          <span className="mb-0.5 text-[11px] font-medium text-white/40">mg/dL</span>
          {latestGlucose && <TrendIcon className="mb-0.5 h-4 w-4" style={{ color: glucoseColor }} />}
        </div>

        <div className="relative z-10 mt-1">
          {readingAgeLabel && <p className="text-[11px] text-white/35">{readingAgeLabel}</p>}
          <span className="mt-1.5 block text-xs font-semibold" style={{ color: glucoseColor }}>
            {rangeCardLabel}
          </span>
        </div>
      </motion.div>

      {open && (
        <InfoPopover anchorRect={anchor} onClose={() => setOpen(false)}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Current Glucose
              </span>
              {latestGlucose && <TrendIcon className="h-3.5 w-3.5" style={{ color: glucoseColor }} />}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black leading-none text-white">{glucoseValue ?? "--"}</span>
              <span className="text-xs font-medium text-white/40">mg/dL</span>
            </div>
            <p className="text-xs font-semibold" style={{ color: glucoseColor }}>{rangeCardLabel}</p>
            {latestGlucose?.recorded_at && (
              <p className="text-[11px] text-white/40">
                {format(new Date(latestGlucose.recorded_at), "h:mm a · MMM d")}
              </p>
            )}
            {onEdit && latestGlucose && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEdit(latestGlucose);
                }}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/5"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>
        </InfoPopover>
      )}
    </>
  );
}