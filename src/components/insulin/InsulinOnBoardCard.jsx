import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import { isBasalInsulinType } from "@/lib/insulinPharmacology";
import InfoPopover from "@/components/graph/InfoPopover";
import BasalCoverageInfo from "./BasalCoverageInfo";
import IobDecayChart from "./IobDecayChart";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  green: "#4d5742",
  amber: "#8a5a12",
  hairline: "#eadccf",
};

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Insulin on Board — editorial layout matching the approved mock.
 * Focal anchor is total bolus IOB; ledger rows for each dose, decay curves
 * SVG, basal flat band. All existing data, handlers, and info popovers
 * preserved; presentation only.
 */
export default function InsulinOnBoardCard({ totalUnits, breakdown, basalRegimenStatus, onEditDose, onDeleteDose }) {
  const [estimateRect, setEstimateRect] = useState(null);
  const [basalInfoRect, setBasalInfoRect] = useState(null);

  const bolusDoses = breakdown.filter((d) => !isBasalInsulinType(d.type));
  const basalDoses = breakdown.filter((d) => isBasalInsulinType(d.type));
  const bolusUnits = bolusDoses.reduce((sum, d) => sum + d.iob, 0);

  const now = Date.now();
  const nowTime = formatClock(now);

  // Per-type breakdown for basal
  const basalTypeBreakdown = useMemo(() => {
    const byType = new Map();
    basalDoses.forEach((d) => {
      const existing = byType.get(d.type);
      if (existing) {
        existing.units += d.units;
      } else {
        byType.set(d.type, { type: d.type, shortName: d.shortName, units: d.units, color: d.color, time: d.time });
      }
    });
    return Array.from(byType.values()).sort((a, b) => b.units - a.units);
  }, [basalDoses]);

  const hasBolus = bolusDoses.length > 0;
  const hasBasal = basalDoses.length > 0;

  return (
    <motion.div whileTap={{ scale: 0.985 }} className="px-1 pt-2 pb-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h3 className="hdr">Insulin <em>on board</em></h3>
        <button
          type="button"
          onClick={(e) => setEstimateRect(e.currentTarget.getBoundingClientRect())}
          className="hdr-date transition hover:opacity-70"
        >
          {nowTime}
        </button>
      </div>

      <AnimatePresence>
        {estimateRect &&
          <InfoPopover anchorRect={estimateRect} onClose={() => setEstimateRect(null)}>
            <p className="text-[11px] font-semibold" style={{ color: PALETTE.ink }}>Estimated insulin activity</p>
            <p className="mt-1 text-[10px] leading-relaxed" style={{ color: PALETTE.muted }}>
              Active insulin and remaining time are estimates based on the insulin profile and time since the dose. Actual insulin action can vary between people and between doses.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: PALETTE.muted }}>
              Basal coverage is modeled separately from bolus insulin. It represents estimated background activity from your basal doses, not the same as bolus IOB.
            </p>
          </InfoPopover>
        }
      </AnimatePresence>

      {/* Focal anchor — total bolus IOB */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="anchor">{bolusUnits.toFixed(2)}</span>
        <span className="text-[22px] font-light" style={{ color: PALETTE.muted }}>u</span>
      </div>

      {/* State line */}
      <div className="mt-1 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: PALETTE.green }} />
        <span className="text-[13px]" style={{ color: PALETTE.ink }}>
          {hasBasal ? "Bolus only, basal runs underneath, never counts" : "Bolus on board"}
        </span>
      </div>

      {/* "Where you started" section */}
      <div className="mt-6">
        <div className="sec">Where you started</div>
        <div className="rule" />
      </div>

      {/* Ledger rows — bolus doses */}
      <div className="mt-2">
        {hasBolus ? (
          bolusDoses.map((dose) => {
            const isCleared = dose.iob < 0.5;
            const doseTime = formatClock(dose.time);
            const label = dose.shortName || dose.type?.split(" ")[0] || "Insulin";
            return (
              <button
                key={dose.id}
                type="button"
                onClick={onEditDose ? () => onEditDose(dose.id) : undefined}
                className="flex w-full items-baseline gap-2 py-2.5 text-left transition hover:opacity-70"
                style={{ color: isCleared ? PALETTE.faint : PALETTE.ink }}
              >
                <span className="shrink-0 text-[14px] font-medium" style={{ color: isCleared ? PALETTE.faint : PALETTE.ink }}>
                  {label}
                </span>
                <span className="flex-1 overflow-hidden">
                  <span className="dotted-leader block" />
                </span>
                <span className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: isCleared ? PALETTE.faint : PALETTE.ink }}>
                  {Number(dose.units).toFixed(2)} u
                </span>
                <span className="shrink-0 text-[12px] tabular-nums" style={{ color: PALETTE.faint }}>
                  {doseTime}
                </span>
                {isCleared && (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: PALETTE.faint }}>
                    cleared
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <p className="py-3 text-[13px]" style={{ color: PALETTE.muted }}>No bolus on board.</p>
        )}
      </div>

      {/* Basal group */}
      {hasBasal && (
        <div className="mt-2">
          {basalTypeBreakdown.map((t) => (
            <div key={t.type} className="flex items-baseline gap-2 py-2.5">
              <span className="shrink-0">
                <span className="inline-block" style={{ width: 26, height: 2, background: PALETTE.green, opacity: 0.55, borderRadius: 1 }} />
              </span>
              <span className="shrink-0 text-[14px] font-medium" style={{ color: PALETTE.ink }}>
                {t.shortName}
              </span>
              <span className="flex-1 overflow-hidden">
                <span className="dotted-leader block" />
              </span>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                {Math.round(t.units)} u
              </span>
              <span className="shrink-0 text-[12px] tabular-nums" style={{ color: PALETTE.faint }}>
                {formatClock(t.time)}
              </span>
            </div>
          ))}
          <p className="mt-0.5 text-[11px]" style={{ color: PALETTE.faint }}>
            runs flat, never stacks
          </p>
          <button
            type="button"
            onClick={(e) => setBasalInfoRect(e.currentTarget.getBoundingClientRect())}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium transition hover:opacity-70"
            style={{ color: PALETTE.muted }}
          >
            <Info className="h-3 w-3" />
            About basal coverage
          </button>
        </div>
      )}

      <AnimatePresence>
        {basalInfoRect &&
          <BasalCoverageInfo
            anchorRect={basalInfoRect}
            onClose={() => setBasalInfoRect(null)}
            insulinType={basalRegimenStatus?.insulinType}
          />
        }
      </AnimatePresence>

      {/* "Where you're headed" section */}
      <div className="mt-6">
        <div className="sec">Where you're headed</div>
        <div className="rule" />
      </div>

      {/* Decay curves chart */}
      <div className="mt-3">
        <IobDecayChart bolusDoses={bolusDoses} basalDoses={basalDoses} />
      </div>

      {/* Legend as ledger rows */}
      <div className="mt-2 space-y-0">
        <div className="flex items-baseline gap-2 py-1.5">
          <span className="shrink-0 text-[12px] font-semibold" style={{ color: PALETTE.ink }}>Bold line</span>
          <span className="flex-1 overflow-hidden"><span className="dotted-leader block" /></span>
          <span className="shrink-0 text-[12px]" style={{ color: PALETTE.muted }}>total bolus IOB</span>
        </div>
        <div className="flex items-baseline gap-2 py-1.5">
          <span className="shrink-0 text-[12px] font-semibold" style={{ color: PALETTE.ink }}>Thin lines</span>
          <span className="flex-1 overflow-hidden"><span className="dotted-leader block" /></span>
          <span className="shrink-0 text-[12px]" style={{ color: PALETTE.muted }}>each dose decaying on its own curve</span>
        </div>
        <div className="flex items-baseline gap-2 py-1.5">
          <span className="shrink-0 text-[12px] font-semibold" style={{ color: PALETTE.ink }}>Flat band</span>
          <span className="flex-1 overflow-hidden"><span className="dotted-leader block" /></span>
          <span className="shrink-0 text-[12px]" style={{ color: PALETTE.muted }}>basal, present all day, never counted</span>
        </div>
      </div>

      {/* Annotation */}
      {hasBolus && (
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
          {(() => {
            const latestDose = bolusDoses[0];
            if (!latestDose) return null;
            const profile = latestDose.type;
            const remainingMs = (latestDose.timingInfo?.remainingMin || 0) * 60 * 1000;
            const settleTime = formatClock(now + remainingMs);
            if (remainingMs > 0) {
              return <>≈ 0 u by {settleTime}. Tap any curve to see that dose's ledger.</>;
            }
            return <>All bolus doses have settled. Tap any curve to see that dose's ledger.</>;
          })()}
        </p>
      )}
    </motion.div>
  );
}