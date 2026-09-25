import { useMemo, useState, useEffect } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import MiniActivitySparkline from "./MiniActivitySparkline";
import SwipeableRow from "@/components/SwipeableRow";
import { isBasalInsulinType, getDoseStatus, getDoseTimingInfo } from "@/lib/insulinPharmacology";

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
  if (status.phase === "expired" || status.iob <= 0.01) {
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
  if (status.phase === "expired" || status.iob <= 0.01) {
    return { label: "Fully cleared", color: PALETTE.grey, remaining: null };
  }
  const remaining = formatRemaining(timing.remainingMin);
  const map = {
    waiting: { label: "Absorbing gently", color: PALETTE.amber },
    rising: { label: "Rising toward peak", color: PALETTE.amber },
    near_peak: { label: "Near peak", color: PALETTE.amber },
    peak: { label: "Peak activity", color: PALETTE.amber },
    declining: { label: "Activity declining", color: PALETTE.green },
    low_activity: { label: "Lingering gently", color: PALETTE.green }
  };
  const entry = map[status.phase] || { label: status.label, color: PALETTE.muted };
  return { label: entry.label, color: entry.color, remaining };
}

export default function IobAtAGlance({ totalUnits, breakdown, basalRegimenStatus, onEditDose, onDeleteDose }) {
  const now = Date.now();
  const [openDoseId, setOpenDoseId] = useState(null);

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

  const bolusDoses = useMemo(
    () => (breakdown || []).filter((d) => !isBasalInsulinType(d.type) && d.iob > 0.01),
    [breakdown]
  );
  const basalDoses = useMemo(
    () => (breakdown || []).filter((d) => isBasalInsulinType(d.type) && d.iob > 0.01),
    [breakdown]
  );

  const bolusUnits = bolusDoses.reduce((sum, d) => sum + d.iob, 0);
  const activeBolusCount = bolusDoses.filter((d) => d.iob > 0.01).length;
  const basalUnits = basalDoses.reduce((sum, d) => sum + (Number(d.units) || 0), 0);
  const hasBolus = bolusDoses.length > 0;
  const hasBasal = basalDoses.length > 0;

  // Gentle awareness: multiple rapid doses active at once
  const showStackingBanner = activeBolusCount > 1;

  return (
    <div className="space-y-3">
      {/* 1. Gentle awareness banner */}
      {showStackingBanner &&
      <DashboardCard className="px-4 py-3">
          <p className="text-[13px] font-semibold leading-snug" style={{ color: PALETTE.ink }}>
            {activeBolusCount} rapid doses are active at once
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
            Notice how you feel — the curves below show where each one is.
          </p>
        </DashboardCard>
      }

      {/* 2. Rapid insulin card */}
      <DashboardCard className="p-4">
        <div className="section-label">Rapid Insulin</div>

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

        {/* One row per dose */}
        {hasBolus ?
        <div className="space-y-2.5">
            {bolusDoses.map((dose) => {
            const status = bolusStatusLine(dose, now);
            const dotColor = dose.color;
            const textColor = PALETTE.ink;
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
                <div className="flex w-full items-center gap-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[13px] font-semibold truncate" style={{ color: textColor }}>
                        {dose.shortName || dose.type?.split(" ")[0] || "Insulin"}
                      </span>
                      <span className="text-[11px]" style={{ color: PALETTE.muted }}>
                        {fmtUnits(dose.units)}u dose
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="shrink-0" style={{ color: dotColor }}>
                        <MiniActivitySparkline dose={dose} now={now} />
                      </span>
                      <span className="text-[11px] leading-tight" style={{ color: PALETTE.muted }}>
                        {status.label}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-semibold tabular-nums" style={{ color: textColor }}>
                      {fmtUnits(dose.iob)}u
                    </span>
                    {status.remaining &&
                  <span className="block text-[10px] tabular-nums" style={{ color: PALETTE.faint }}>
                        {status.remaining}
                      </span>
                  }
                  </span>
                </div>
              </SwipeableRow>);

          })}
          </div> :

        <p className="py-2 text-[12px]" style={{ color: PALETTE.muted }}>No rapid insulin on board.</p>
        }
      </DashboardCard>

      {/* 4. Basal / background card */}
      {hasBasal &&
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
            const dotColor = dose.color;
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
                        {fmtUnits(dose.units)}u dose
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span style={{ color: dotColor }}>
                        <MiniActivitySparkline dose={dose} now={now} />
                      </span>
                      <span className="text-[11px] leading-tight" style={{ color: PALETTE.muted }}>
                        {status.label}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-semibold tabular-nums" style={{ color: textColor }}>
                      {fmtUnits(dose.units)}u
                    </span>
                    {status.remaining &&
                  <span className="block text-[10px] tabular-nums" style={{ color: PALETTE.faint }}>
                        {status.remaining}
                      </span>
                  }
                  </span>
                </div>
              </SwipeableRow>);

          })}
          </div>

          

        
        </DashboardCard>
      }
    </div>);

}