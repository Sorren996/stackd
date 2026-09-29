import { format } from "date-fns";
import { TrendingDown } from "lucide-react";
import DaySection from "./DaySection";
import { formatDuration } from "@/lib/dayRecapMetrics";
import { formatGlucose, formatGlucoseAbsDelta, glucoseDeltaUnit } from "@/lib/glucoseUnits";

export default function DayRecovery({ recovery, bare = false }) {
  if (!recovery) return null;

  const { startTime, startValue, peakTime, peakValue, rise, recoveryTime, recoveryValue, recoveryMinutes } = recovery;

  const content = (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3 py-2">
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: "#3f3830" }}>{formatGlucose(startValue)}</p>
          <p className="text-[9px]" style={{ color: "#746959" }}>{format(new Date(startTime), "h:mm a")}</p>
        </div>
        <span style={{ color: "#746959" }}>↑</span>
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: "#af751b" }}>
            {formatGlucose(peakValue)}
          </p>
          <p className="text-[9px]" style={{ color: "#746959" }}>{format(new Date(peakTime), "h:mm a")}</p>
        </div>
        {recoveryValue != null && (
          <>
            <span style={{ color: "#746959" }}>↓</span>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: "#3f3830" }}>{formatGlucose(recoveryValue)}</p>
              <p className="text-[9px]" style={{ color: "#746959" }}>{recoveryTime ? format(new Date(recoveryTime), "h:mm a") : ""}</p>
            </div>
          </>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>
        Glucose rose {formatGlucoseAbsDelta(rise)} {glucoseDeltaUnit()}
        {recoveryMinutes != null
          ? `, then returned toward baseline in ${formatDuration(recoveryMinutes * 60000)}.`
          : " and had not fully returned to baseline by the last reading."}
      </p>
    </div>
  );

  if (bare) return content;

  return (
    <DaySection icon={TrendingDown} iconColor="#af751b" label="Recovery" collapsible>
      {content}
    </DaySection>
  );
}