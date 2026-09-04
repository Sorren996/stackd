import { format } from "date-fns";
import { Activity } from "lucide-react";
import DaySection from "./DaySection";
import { getInsulinProfile, getDoseTimingInfo, isBolusInsulinType, isBasalInsulinType } from "@/lib/insulinPharmacology";

function Stat({ label, value, unit }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.02)" }}>
      <p className="text-[9px] uppercase tracking-wider text-white/35">{label}</p>
      <p className="text-sm font-bold text-white/90">
        {value}
        {unit && <span className="text-[10px] text-white/40">{unit}</span>}
      </p>
    </div>
  );
}

function DoseBar({ dose, dayStart, dayEnd }) {
  const profile = getInsulinProfile(dose.insulin_type);
  const timing = getDoseTimingInfo(dose, dose.time + 1);
  const durationMs = timing.totalDurationMin * 60 * 1000;
  const span = dayEnd - dayStart;
  const startPct = ((dose.time - dayStart) / span) * 100;
  const widthPct = Math.min(100 - Math.max(0, startPct), Math.max(3, (durationMs / span) * 100));

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[9px] text-white/35">{format(new Date(dose.time), "h:mm a")}</span>
      <div className="relative h-4 flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div
          className="absolute top-0 h-4 rounded-full"
          style={{
            left: `${Math.max(0, startPct)}%`,
            width: `${widthPct}%`,
            background: profile?.color || "#5ba3b8",
            opacity: 0.4,
          }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[9px] font-medium text-white/50">{dose.units}u</span>
    </div>
  );
}

export default function DayInsulinActivity({ activity }) {
  if (!activity || !activity.doses?.length) return null;

  const { doses, totalUnits, bolusUnits, basalUnits, peakTime, highActivityStart, highActivityEnd, overlapCount, dayStart, dayEnd } = activity;

  return (
    <DaySection icon={Activity} iconColor="#5ba3b8" label="Insulin Activity" collapsible>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total" value={totalUnits} unit="u" />
          {bolusUnits > 0 && <Stat label="Bolus" value={bolusUnits} unit="u" />}
          {basalUnits > 0 && <Stat label="Basal" value={basalUnits} unit="u" />}
        </div>

        {peakTime && highActivityStart && highActivityEnd && (
          <p className="text-xs leading-relaxed text-white/50">
            Highest insulin activity occurred between {format(new Date(highActivityStart), "h:mm a")} and{" "}
            {format(new Date(highActivityEnd), "h:mm a")}.
          </p>
        )}

        {overlapCount > 0 && (
          <p className="text-xs leading-relaxed text-amber-200/60">
            {overlapCount === 1
              ? "Multiple insulin doses overlapped during this period."
              : `${overlapCount} periods had overlapping insulin activity.`}
          </p>
        )}

        <div className="space-y-1.5">
          {doses.map((dose, i) => (
            <DoseBar key={dose.id || i} dose={dose} dayStart={dayStart} dayEnd={dayEnd} />
          ))}
        </div>
      </div>
    </DaySection>
  );
}