import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import { isBasalInsulinType } from "@/lib/insulinPharmacology";
import InsulinDoseRow from "./InsulinDoseRow";
import InfoPopover from "@/components/graph/InfoPopover";
import BasalCoverageInfo from "./BasalCoverageInfo";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < MINUTE_MS) return "just now";
  if (ms < HOUR_MS) {
    const m = Math.round(ms / MINUTE_MS);
    return `${m}m ago`;
  }
  if (ms < DAY_MS) {
    const h = Math.round(ms / HOUR_MS);
    return `${h}h ago`;
  }
  const d = Math.round(ms / DAY_MS);
  return `${d}d ago`;
}

// States where a modeled percentage is meaningful to display.
const PERCENTAGE_STATES = new Set(["stabilizing", "steady", "active", "declining"]);
// States where coverage is actively providing background insulin.
const ACTIVE_STATES = new Set(["building", "stabilizing", "steady", "active", "declining"]);

/**
 * Insulin on Board container. Bolus IOB uses the existing pharmacokinetic
 * decay model; basal coverage uses the basal activity model's plain-language
 * states and modeled percentage. The two are visually distinct so the user
 * never confuses background basal coverage with rapid-acting IOB.
 */
export default function InsulinOnBoardCard({ totalUnits, breakdown, basalRegimenStatus }) {
  const bolusDoses = breakdown.filter((d) => !isBasalInsulinType(d.type));
  const basalDoses = breakdown.filter((d) => isBasalInsulinType(d.type));
  const bolusUnits = bolusDoses.reduce((sum, d) => sum + d.iob, 0);
  const hasBolusIOB = bolusUnits > 0.01;
  const [estimateRect, setEstimateRect] = useState(null);
  const [basalInfoRect, setBasalInfoRect] = useState(null);

  const basalState = basalRegimenStatus?.state || "none";
  const showPercentage = PERCENTAGE_STATES.has(basalState) && basalRegimenStatus?.basalCoverage != null;
  const coverageLabel = basalRegimenStatus?.coverageLabel || "No basal insulin logged";
  const isBasalActive = ACTIVE_STATES.has(basalState);

  // Most recent basal dose — shown as "Tresiba · 30U · Taken 14h ago"
  const latestBasalDose = basalDoses[0] || null;
  const latestBasalLabel = latestBasalDose
    ? `${latestBasalDose.shortName} · ${latestBasalDose.units % 1 === 0 ? latestBasalDose.units : latestBasalDose.units.toFixed(1)}u`
    : null;
  const latestBasalElapsed = basalRegimenStatus?.elapsedTime ?? null;
  const latestBasalElapsedLabel = latestBasalElapsed != null ? formatElapsed(latestBasalElapsed) : null;

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className="metric-card stackd-card relative col-span-2 overflow-hidden rounded-2xl p-4"
    >
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Insulin on Board</span>
          <button
            type="button"
            onClick={(e) => setEstimateRect(e.currentTarget.getBoundingClientRect())}
            className="flex items-center gap-1 self-start text-white/30 transition-colors hover:text-white/50"
          >
            <span className="text-[9px] font-medium">Estimated activity</span>
            <Info className="h-3 w-3" />
          </button>
        </div>
        <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold" style={{
          color: hasBolusIOB ? "#5ba3b8" : "rgba(255,255,255,0.42)",
          borderColor: hasBolusIOB ? "rgba(6,182,212,0.32)" : "rgba(255,255,255,0.1)",
          background: hasBolusIOB ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.04)",
        }}>
          {hasBolusIOB ? "Supporting you" : "Settled"}
        </span>
      </div>

      <AnimatePresence>
        {estimateRect && (
          <InfoPopover anchorRect={estimateRect} onClose={() => setEstimateRect(null)}>
            <p className="text-[11px] font-semibold text-white/85">Estimated insulin activity</p>
            <p className="mt-1 text-[10px] leading-relaxed text-white/55">
              Active insulin and remaining time are estimates based on the insulin profile and time since the dose. Actual insulin action can vary between people and between doses.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-white/55">
              Basal coverage is modeled separately from bolus insulin — it represents estimated background activity from your basal doses, not the same as bolus IOB. Basal insulin releases gradually over an extended period, and overlapping doses contribute to your ongoing background activity.
            </p>
          </InfoPopover>
        )}
      </AnimatePresence>

      <div className="relative z-10 mt-3 flex items-center">
        <div className="flex flex-1 flex-col">
          <div className="flex items-end gap-1">
            <span className="text-3xl font-black leading-none text-white">{Math.round(bolusUnits)}</span>
            <span className="mb-0.5 text-[10px] font-medium text-white/40">u</span>
          </div>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">Bolus active</span>
        </div>
        <div className="mx-3 w-px self-stretch bg-white/10" />
        <div className="flex min-w-0 flex-1 flex-col">
          {showPercentage ? (
            <div className="flex items-end gap-1">
              <span className="text-3xl font-black leading-none text-white">{basalRegimenStatus.basalCoverage}</span>
              <span className="mb-0.5 text-[10px] font-medium text-white/40">%</span>
            </div>
          ) : (
            <span className="truncate text-sm font-bold leading-tight text-white">{coverageLabel}</span>
          )}
          <div className="mt-0.5 flex items-center gap-1.5">
            {isBasalActive && (
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1, 0.85] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.6)" }}
              />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Basal Coverage</span>
            <button
              type="button"
              onClick={(e) => setBasalInfoRect(e.currentTarget.getBoundingClientRect())}
              className="text-white/25 transition-colors hover:text-white/50"
            >
              <Info className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Plain-language coverage state + most recent dose summary */}
      {basalState !== "none" && (
        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[11px] font-semibold text-white/70">{coverageLabel}</span>
          {latestBasalLabel && latestBasalElapsedLabel && (
            <span className="text-[10px] text-white/40">
              · {latestBasalLabel} · Taken {latestBasalElapsedLabel}
            </span>
          )}
        </div>
      )}

      <AnimatePresence>
        {basalInfoRect && (
          <BasalCoverageInfo
            anchorRect={basalInfoRect}
            onClose={() => setBasalInfoRect(null)}
            insulinType={basalRegimenStatus?.insulinType}
          />
        )}
      </AnimatePresence>

      {breakdown.length ? (
        <div className="relative z-10 mt-4 space-y-3">
          {bolusDoses.length > 0 && (
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">Rapid Insulin</span>
              <div className="mt-1.5 divide-y divide-white/[0.06]">
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
              <div className="mt-1.5 divide-y divide-white/[0.06]">
                {basalDoses.map((dose) => (
                  <InsulinDoseRow key={dose.id} dose={dose} regimenStatus={basalRegimenStatus} />
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