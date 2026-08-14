import { motion } from "framer-motion";
import { isBasalInsulinType } from "@/lib/insulinPharmacology";
import InsulinDoseRow from "./InsulinDoseRow";

/**
 * Redesigned Insulin on Board container. Preserves the existing bolus/basal
 * IOB totals and dose breakdown calculations from ActiveInsulinBanner — this
 * component only changes the presentation layer.
 */
export default function InsulinOnBoardCard({ totalUnits, breakdown }) {
  const hasBolusIOB = totalUnits > 0.01;
  const bolusDoses = breakdown.filter((d) => !isBasalInsulinType(d.type));
  const basalDoses = breakdown.filter((d) => isBasalInsulinType(d.type));
  const bolusUnits = bolusDoses.reduce((sum, d) => sum + d.iob, 0);
  const basalUnits = basalDoses.reduce((sum, d) => sum + d.iob, 0);

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className="metric-card relative col-span-2 overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        background: "linear-gradient(145deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))",
        borderColor: "rgba(255,255,255,0.16)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.05)",
      }}
    >
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Insulin on Board</span>
        <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold" style={{
          color: hasBolusIOB ? "#5ba3b8" : "rgba(255,255,255,0.42)",
          borderColor: hasBolusIOB ? "rgba(6,182,212,0.32)" : "rgba(255,255,255,0.1)",
          background: hasBolusIOB ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.04)",
        }}>
          {hasBolusIOB ? "Supporting you" : "Settled"}
        </span>
      </div>

      <div className="relative z-10 mt-3 flex items-center">
        <div className="flex flex-1 flex-col">
          <div className="flex items-end gap-1">
            <span className="text-3xl font-black leading-none text-white">{Math.round(bolusUnits)}</span>
            <span className="mb-0.5 text-[10px] font-medium text-white/40">u</span>
          </div>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">Bolus active</span>
        </div>
        <div className="mx-3 w-px self-stretch bg-white/10" />
        <div className="flex flex-1 flex-col">
          <div className="flex items-end gap-1">
            <span className="text-3xl font-black leading-none text-white">{Math.round(basalUnits)}</span>
            <span className="mb-0.5 text-[10px] font-medium text-white/40">u</span>
          </div>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">Basal active</span>
        </div>
      </div>

      {breakdown.length ? (
        <div className="relative z-10 mt-4 space-y-3">
          {bolusDoses.length > 0 && (
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">Rapid Insulin</span>
              <div className="mt-1.5 space-y-1.5">
                {bolusDoses.map((dose) => (
                  <InsulinDoseRow key={dose.id} dose={dose} />
                ))}
              </div>
            </div>
          )}
          {basalDoses.length > 0 && (
            <div>
              {bolusDoses.length > 0 && <div className="mb-2.5 h-px bg-white/10" />}
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">Basal / Background</span>
              <div className="mt-1.5 space-y-1.5">
                {basalDoses.map((dose) => (
                  <InsulinDoseRow key={dose.id} dose={dose} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative z-10 mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-white/40">
          No active insulin on board from current logs.
        </div>
      )}
    </motion.div>
  );
}