import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import SwipeableRow from "@/components/SwipeableRow";
import IobDecayChart from "@/components/insulin/IobDecayChart";
import RemainingBar, { RemainingLegend } from "@/components/insulin/RemainingBars";
import { isBasalInsulinType, getDoseStatus, getDoseTimingInfo } from "@/lib/insulinPharmacology";
import { formatIOBValue, IOB_FLOOR } from "@/lib/iobModel";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  green: "#4d5742",
  amber: "#8a5a12",
  grey: "#b8aea0",
  hairline: "#eadccf",
  card: "#fdf9f2"
};

// Safe unit formatter — guards against missing/undefined unit values so a
// single malformed dose can never throw and blank the whole card.
function fmtUnits(u) {
  const n = Number(u);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? n : n.toFixed(1);
}

// IOB display: real number with 1 decimal at ≥0.5u, 2 decimals below 0.5u
// (tail reads 0.42 → 0.08 → 0.01 → 0.00). Never "<1u" — the finite-DIA beta
// curve reaches exactly 0.00, so the ghost tail is retired.
function fmtIob(u) {
  return `${formatIOBValue(u)}u`;
}

// Dynamic basal status derived from real elapsed time vs that basal's
// published duration — mirrors bolusStatusLine so each basal dose row
// reflects its actual phase instead of a single static "Ongoing" label.
function basalStatusLine(dose, now) {
  const doseObj = {
    insulin_type: dose.type,
    units: dose.units,
    administered_at: new Date(dose.time).toISOString()
  };
  const status = getDoseStatus(doseObj, now);
  const timing = getDoseTimingInfo(doseObj, now);
  if (status.phase === "expired" || status.iob <= IOB_FLOOR) {
    return { label: "No longer contributing", remaining: null };
  }
  const remaining = formatRemaining(timing.remainingMin);
  const map = {
    waiting: { label: "Absorbing gently" },
    steady: { label: "Steady background coverage" },
    declining: { label: "Coverage winding down" },
    low_activity: { label: "Lingering gently" }
  };
  const entry = map[status.phase] || { label: status.label };
  return { label: entry.label, remaining };
}

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatRemaining(min) {
  if (!Number.isFinite(min) || min <= 0) return null;
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// Plain-language status + color for a bolus dose, derived from the existing
// exponential model's phase. Amber for early/absorbing, sage for declining.
function bolusStatusLine(dose, now) {
  // Breakdown doses use { type, units, time } — remap to the field names the
  // pharmacology engine expects so the status reflects this dose's real phase
  // (absorbing / peak / declining) instead of always reading as "expired".
  const doseObj = {
    insulin_type: dose.type,
    units: dose.units,
    administered_at: new Date(dose.time).toISOString()
  };
  const status = getDoseStatus(doseObj, now);
  const timing = getDoseTimingInfo(doseObj, now);
  if (status.phase === "expired" || status.iob <= IOB_FLOOR) {
    return { label: "Fully cleared", color: PALETTE.grey, remaining: null };
  }
  const remaining = formatRemaining(timing.remainingMin);
  // Every possible phase gets a bolus-appropriate label so a basal-language
  // phase ("steady" from a flat-model profile) can never leak onto a bolus
  // row, even if the insulin profile was misresolved by the engine.
  const map = {
    waiting: { label: "Absorbing gently", color: PALETTE.amber },
    rising: { label: "Rising toward peak", color: PALETTE.amber },
    near_peak: { label: "Near peak", color: PALETTE.amber },
    peak: { label: "Peak activity", color: PALETTE.amber },
    steady: { label: "Active and working", color: PALETTE.amber },
    declining: { label: "Activity declining", color: PALETTE.green },
    low_activity: { label: "Lingering gently", color: PALETTE.green }
  };
  const entry = map[status.phase] || { label: "Active and working", color: PALETTE.muted };
  return { label: entry.label, color: entry.color, remaining };
}

export default function IobAtAGlance({ totalUnits, breakdown, basalRegimenStatus, onEditDose, onDeleteDose }) {
  const now = Date.now();
  const [openDoseId, setOpenDoseId] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // Close any revealed swipe actions when the IOB view unmounts or the
  // underlying breakdown reference changes (new ingestion, refresh, etc.).
  useEffect(() => {
    return () => setOpenDoseId(null);
  }, [breakdown]);

  // "Tap anywhere else dismisses" — closes the open row when a pointerdown
  // lands outside that row (lets the row's own buttons/content keep working).
  useEffect(() => {
    if (openDoseId == null) return;
    const onPointerDown = (e) => {
      const openRow = document.querySelector(`[data-row-id="${openDoseId}"]`);
      if (openRow && openRow.contains(e.target)) return;
      setOpenDoseId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openDoseId]);

  // Chronological order — earliest dose first, matching "Remaining by dose"
  // as a chronological read.
  const bolusDoses = useMemo(
    () =>
      (breakdown || [])
        .filter((d) => !isBasalInsulinType(d.type) && d.iob > IOB_FLOOR)
        .sort((a, b) => a.time - b.time),
    [breakdown]
  );
  const basalDoses = useMemo(
    () => (breakdown || []).filter((d) => isBasalInsulinType(d.type) && d.iob > IOB_FLOOR),
    [breakdown]
  );

  // Sum rounded dose IOB values so the headline always matches the sum of
  // the displayed (one-decimal) per-dose values — no rounding discrepancy.
  const bolusUnits = bolusDoses.reduce((sum, d) => sum + (Math.round(d.iob * 10) / 10), 0);
  // Only doses with meaningful IOB count as "active" — fully-cleared doses
  // (0.00u) stay listed for context but don't inflate the active count.
  const activeBolusCount = bolusDoses.filter((d) => d.iob > IOB_FLOOR).length;
  const basalUnits = basalDoses.reduce((sum, d) => sum + (Number(d.units) || 0), 0);
  const hasBolus = bolusDoses.length > 0;
  const hasBasal = basalDoses.length > 0;

  // Gentle awareness: multiple rapid doses active at once
  const showStackingBanner = activeBolusCount > 1;

  return (
    <div className="space-y-3">
      {/* 1. Gentle awareness banner */}
      {showStackingBanner && (
        <DashboardCard className="px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-[14px]" style={{ color: PALETTE.amber }}>⚠</span>
            <div>
              <p className="text-[13px] font-semibold leading-snug" style={{ color: PALETTE.ink }}>
                {activeBolusCount} rapid doses are active at once
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
                Notice how you feel.
              </p>
            </div>
          </div>
        </DashboardCard>
      )}

      {/* 2. Rapid insulin card */}
      <DashboardCard className="p-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="section-label" style={{ marginBottom: 0 }}>Insulin on Board</span>
            <span className="text-[10px] font-medium" style={{ color: PALETTE.faint }}>Estimated</span>
          </div>
        </div>

        {/* Totals row */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="anchor" style={{ fontSize: 34 }}>{bolusUnits.toFixed(1)}</span>
          <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>u on board</span>
        </div>
        <p className="mt-0.5 text-[12px]" style={{ color: PALETTE.faint }}>
          {activeBolusCount} active {activeBolusCount === 1 ? "dose" : "doses"}
        </p>

        {/* Hairline divider */}
        <div className="my-3" style={{ height: 1, background: PALETTE.hairline }} />

        {/* Remaining by dose — self-relative horizontal bars */}
        {hasBolus ? (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: PALETTE.faint }}>
              Remaining by dose
            </div>
            <div className="mb-3">
              <RemainingLegend />
            </div>
            <div className="space-y-3">
              {bolusDoses.map((dose) => {
                const status = bolusStatusLine(dose, now);
                return (
                  <SwipeableRow
                    key={dose.id}
                    rowId={dose.id}
                    isOpen={openDoseId === dose.id}
                    onOpenChange={(o) => setOpenDoseId(o ? dose.id : null)}
                    onEdit={() => onEditDose?.(dose.id)}
                    onDelete={() => onDeleteDose?.(dose.id)}
                    editLabel="Edit"
                    deleteLabel="Remove"
                    itemLabel={`${dose.shortName || dose.type?.split(" ")[0] || "Insulin"}, ${fmtUnits(dose.units)}u`}
                  >
                    <div className="w-full">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="text-[13px] font-semibold truncate" style={{ color: PALETTE.ink }}>
                            {dose.shortName || dose.type?.split(" ")[0] || "Insulin"}
                          </span>
                          <span className="text-[11px] ml-1.5" style={{ color: PALETTE.muted }}>
                            {fmtUnits(dose.units)}u logged, {formatClock(dose.time)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[15px] font-semibold tabular-nums leading-none" style={{ color: PALETTE.ink }}>
                            {fmtIob(dose.iob)}
                          </span>
                          <span className="block text-[9px] mt-0.5" style={{ color: PALETTE.faint }}>remaining</span>
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <RemainingBar logged={dose.units} remaining={dose.iob} />
                      </div>
                      <div className="mt-1 text-[10px] leading-tight" style={{ color: PALETTE.faint }}>
                        {status.label}
                        {status.remaining && (
                          <>
                            {" · clears in "}
                            <motion.span key={status.remaining} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                              {status.remaining}
                            </motion.span>
                          </>
                        )}
                      </div>
                    </div>
                  </SwipeableRow>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed" style={{ color: PALETTE.faint }}>
              Each bar is scaled to its own logged amount — the fill shows what fraction of that dose is still estimated to be active, not activity strength.
            </p>

            {/* Optional activity view — existing canonical curve visualization */}
            <div className="mt-3" style={{ borderTop: `1px solid ${PALETTE.hairline}`, paddingTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                aria-expanded={showDetails}
                className="flex w-full items-center justify-between"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PALETTE.faint }}>
                  View activity
                </span>
                <ChevronDown
                  size={14}
                  style={{ color: PALETTE.faint, transform: showDetails ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
                />
              </button>
              {showDetails && (
                <div className="mt-3">
                  <IobDecayChart bolusDoses={bolusDoses} basalDoses={[]} now={now} />
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: PALETTE.faint }}>
                    Curves show <span style={{ fontWeight: 600 }}>relative activity</span> (peak-normalized), not units. Solid curves are activity already underway; the dashed mustard line projects the remaining tail. Your estimated live insulin on board in units is shown above.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="py-2 text-[12px]" style={{ color: PALETTE.muted }}>No rapid insulin on board.</p>
        )}
      </DashboardCard>

      {/* 4. Basal / background card */}
      {hasBasal && (
        <DashboardCard className="p-4">
          <div className="section-label">Basal / Background</div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="anchor" style={{ fontSize: 34 }}>{basalUnits % 1 === 0 ? basalUnits : basalUnits.toFixed(1)}</span>
            <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>u background</span>
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: PALETTE.faint }}>
            {basalDoses.length} {basalDoses.length === 1 ? "dose" : "doses"}
          </p>

          <div className="my-3" style={{ height: 1, background: PALETTE.hairline }} />

          <div className="space-y-2.5">
            {basalDoses.map((dose) => {
              const textColor = PALETTE.ink;
              const status = basalStatusLine(dose, now);
              return (
                <SwipeableRow
                  key={dose.id}
                  rowId={dose.id}
                  isOpen={openDoseId === dose.id}
                  onOpenChange={(o) => setOpenDoseId(o ? dose.id : null)}
                  onEdit={() => onEditDose?.(dose.id)}
                  onDelete={() => onDeleteDose?.(dose.id)}
                  editLabel="Edit"
                  deleteLabel="Remove"
                  itemLabel={`${dose.shortName || dose.type?.split(" ")[0] || "Basal"}, ${fmtUnits(dose.units)}u`}
                >
                  <div className="flex w-full items-center gap-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[13px] font-semibold" style={{ color: textColor }}>
                          {dose.shortName || dose.type?.split(" ")[0] || "Basal"}
                        </span>
                        <span className="text-[11px]" style={{ color: PALETTE.muted }}>
                          {fmtUnits(dose.units)}u, {formatClock(dose.time)}
                        </span>
                      </span>
                      <span className="mt-0.5 text-[11px] leading-tight" style={{ color: PALETTE.muted }}>
                        {status.label}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-semibold tabular-nums" style={{ color: textColor }}>
                        {fmtIob(dose.units)}
                      </span>
                      {status.remaining && (
                        <span className="block text-[10px] tabular-nums" style={{ color: PALETTE.faint }}>
                          clears in{" "}
                          <motion.span key={status.remaining} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                            {status.remaining}
                          </motion.span>
                        </span>
                      )}
                    </span>
                  </div>
                </SwipeableRow>
              );
            })}
          </div>
        </DashboardCard>
      )}
    </div>
  );
}