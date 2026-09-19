import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import { isBasalInsulinType } from "@/lib/insulinPharmacology";
import InsulinDoseRow from "./InsulinDoseRow";
import InfoPopover from "@/components/graph/InfoPopover";
import BasalCoverageInfo from "./BasalCoverageInfo";

/**
 * Insulin on Board card. The primary number is RAPID-ACTING IOB ONLY —
 * the sum of getDoseIOB for every active bolus dose (the same model the
 * graph draws). The dose count is the number of currently active bolus
 * doses.
 *
 * BASAL COVERAGE aggregates ALL relevant basal doses (not just the most
 * recent) into a total-administered summary with a per-type breakdown.
 * This is an accounting number ("how much basal have I taken?"), NOT
 * conventional IOB — basal insulin is never expressed as active units.
 *
 * Both the card and the activity graph consume the same per-dose
 * getDoseIOB / generateActivityCurve calculations from
 * insulinPharmacology.js, so they never disagree.
 */
export default function InsulinOnBoardCard({ totalUnits, breakdown, basalRegimenStatus }) {
  const bolusDoses = breakdown.filter((d) => !isBasalInsulinType(d.type));
  const basalDoses = breakdown.filter((d) => isBasalInsulinType(d.type));
  const bolusUnits = bolusDoses.reduce((sum, d) => sum + d.iob, 0);
  const [estimateRect, setEstimateRect] = useState(null);
  const [basalInfoRect, setBasalInfoRect] = useState(null);

  // Aggregate ALL basal doses — not just the most recent. Each dose's
  // `units` is the total administered amount; `iob` confirms it's still
  // relevant (the breakdown already filters to IOB >= 0.5).
  const totalBasalUnits = basalDoses.reduce((sum, d) => sum + d.units, 0);
  const basalDoseCount = basalDoses.length;

  // Per-type breakdown (e.g., Tresiba · 44u, Lantus · 20u)
  const basalTypeBreakdown = useMemo(() => {
    const byType = new Map();
    basalDoses.forEach((d) => {
      const existing = byType.get(d.type);
      if (existing) {
        existing.units += d.units;
      } else {
        byType.set(d.type, { type: d.type, shortName: d.shortName, units: d.units, color: d.color });
      }
    });
    return Array.from(byType.values()).sort((a, b) => b.units - a.units);
  }, [basalDoses]);

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className="relative col-span-2 overflow-hidden rounded-2xl p-4">

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Insulin on Board</span>
        <button
          type="button"
          onClick={(e) => setEstimateRect(e.currentTarget.getBoundingClientRect())}
          className="flex items-center gap-1 text-white/30 transition-colors hover:text-white/50">
          <span className="text-[9px] font-medium">Estimated activity</span>
          <Info className="h-3 w-3" />
        </button>
      </div>

      <AnimatePresence>
        {estimateRect &&
        <InfoPopover anchorRect={estimateRect} onClose={() => setEstimateRect(null)}>
            <p className="text-[11px] font-semibold text-white/85">Estimated insulin activity</p>
            <p className="mt-1 text-[10px] leading-relaxed text-white/55">
              Active insulin and remaining time are estimates based on the insulin profile and time since the dose. Actual insulin action can vary between people and between doses.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-white/55">
              Basal coverage is modeled separately from bolus insulin — it represents estimated background activity from your basal doses, not the same as bolus IOB. Basal insulin releases gradually over an extended period, and overlapping doses contribute to your ongoing background activity.
            </p>
          </InfoPopover>
        }
      </AnimatePresence>

      {/* Primary: Rapid-acting IOB + dose count */}
      <div className="relative z-10 mt-3 flex items-center">
        <div className="flex flex-1 flex-col">
          <div className="flex items-end gap-1">
            <span className="text-3xl font-black leading-none text-white">{Math.round(bolusUnits)}</span>
            <span className="mb-0.5 text-[10px] font-medium text-white/40">u</span>
          </div>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">Rapid-Acting Active</span>
        </div>
        <div className="mx-3 w-px self-stretch bg-white/10" />
        <div className="flex flex-1 flex-col">
          <span className="text-3xl font-black leading-none text-white">{bolusDoses.length}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">Doses Active</span>
        </div>
      </div>

      {/* Divider */}
      <div className="relative z-10 my-4 h-px bg-white/10" />

      {/* Basal Coverage — aggregates ALL relevant basal doses */}
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Basal Coverage</span>
          {basalDoses.length > 0 && (
            <button
              type="button"
              onClick={(e) => setBasalInfoRect(e.currentTarget.getBoundingClientRect())}
              className="text-white/25 transition-colors hover:text-white/50">
              <Info className="h-3 w-3" />
            </button>
          )}
        </div>
        {basalDoses.length > 0 ? (
          <>
            <div className="mt-2 flex items-center">
              <div className="flex flex-1 flex-col">
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-black leading-none text-white">{Math.round(totalBasalUnits)}</span>
                  <span className="mb-0.5 text-[10px] font-medium text-white/40">u</span>
                </div>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">Total Basal</span>
              </div>
              <div className="mx-3 w-px self-stretch bg-white/10" />
              <div className="flex flex-1 flex-col">
                <span className="text-2xl font-black leading-none text-white">{basalDoseCount}</span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">{basalDoseCount === 1 ? "Dose" : "Doses"}</span>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] font-medium text-white/40">Background · Ongoing</p>
            {/* Per-type breakdown */}
            {basalTypeBreakdown.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {basalTypeBreakdown.map((t) => (
                  <div key={t.type} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="text-[10px] font-medium text-white/55">{t.shortName}</span>
                    <span className="text-[10px] text-white/40">· {Math.round(t.units)}u</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-white/40">No basal insulin logged</p>
        )}
      </div>

      <AnimatePresence>
        {basalInfoRect &&
        <BasalCoverageInfo
          anchorRect={basalInfoRect}
          onClose={() => setBasalInfoRect(null)}
          insulinType={basalRegimenStatus?.insulinType} />
        }
      </AnimatePresence>

      {/* Dose rows — each row's "Xu active" uses the same getDoseIOB value
          that contributes to the primary IOB total above. */}
      {breakdown.length ?
      <div className="relative z-10 mt-4 space-y-3">
          {bolusDoses.length > 0 &&
        <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">Rapid Insulin</span>
              <div className="mt-1.5 divide-y divide-white/[0.06]">
                {bolusDoses.map((dose) =>
            <InsulinDoseRow key={dose.id} dose={dose} />
            )}
              </div>
            </div>
        }
          {basalDoses.length > 0 &&
        <div>
              {bolusDoses.length > 0 && <div className="mb-2.5 h-px bg-white/10" />}
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">Basal / Background</span>
              <div className="mt-1.5 divide-y divide-white/[0.06]">
                {basalDoses.map((dose) =>
            <InsulinDoseRow key={dose.id} dose={dose} />
            )}
              </div>
            </div>
        }
        </div> :

      <div className="relative z-10 mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-white/40">
          No active insulin on board from current logs.
        </div>
      }
    </motion.div>
  );
}