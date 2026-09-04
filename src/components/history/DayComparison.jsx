import { BarChart3 } from "lucide-react";
import DaySection from "./DaySection";

export default function DayComparison({ comparison }) {
  if (!comparison) return null;

  const { todayTir, avgTir, todayAvg, avgAvg, tirInterpretation, daysCompared } = comparison;

  const hasTir = todayTir != null && avgTir != null;
  const hasAvg = todayAvg != null && avgAvg != null;

  if (!hasTir && !hasAvg) return null;

  return (
    <DaySection icon={BarChart3} iconColor="#5ba88a" label="Compared with Your Usual" collapsible>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl px-3 py-2.5"
            style={{ background: "rgba(91,168,138,0.06)", border: "1px solid rgba(91,168,138,0.15)" }}
          >
            <p className="text-[9px] uppercase tracking-wider text-white/35">Today</p>
            {hasTir ? (
              <p className="text-lg font-bold text-teal-300/90">{todayTir}%</p>
            ) : (
              <p className="text-lg font-bold text-white/80">
                {todayAvg} <span className="text-[10px]">mg/dL</span>
              </p>
            )}
            <p className="text-[9px] text-white/30">{hasTir ? "comfort zone" : "average"}</p>
          </div>
          <div
            className="rounded-xl px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-[9px] uppercase tracking-wider text-white/35">{daysCompared}-day avg</p>
            {hasTir ? (
              <p className="text-lg font-bold text-white/60">{avgTir}%</p>
            ) : (
              <p className="text-lg font-bold text-white/60">
                {avgAvg} <span className="text-[10px]">mg/dL</span>
              </p>
            )}
            <p className="text-[9px] text-white/30">{hasTir ? "comfort zone" : "average"}</p>
          </div>
        </div>

        {tirInterpretation && <p className="text-xs leading-relaxed text-white/55">{tirInterpretation}</p>}
      </div>
    </DaySection>
  );
}