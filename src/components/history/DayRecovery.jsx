import { format } from "date-fns";
import { TrendingDown } from "lucide-react";
import DaySection from "./DaySection";
import { formatDuration } from "@/lib/dayRecapMetrics";

export default function DayRecovery({ recovery }) {
  if (!recovery) return null;

  const { startTime, startValue, peakTime, peakValue, rise, recoveryTime, recoveryValue, recoveryMinutes } = recovery;

  return (
    <DaySection icon={TrendingDown} iconColor="#d4a056" label="Recovery" collapsible>
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-3 py-2">
          <div className="text-center">
            <p className="text-2xl font-black text-white/80">{Math.round(startValue)}</p>
            <p className="text-[9px] text-white/35">{format(new Date(startTime), "h:mm a")}</p>
          </div>
          <span className="text-white/30">↓</span>
          <div className="text-center">
            <p className="text-2xl font-black" style={{ color: "#d4a056" }}>
              {Math.round(peakValue)}
            </p>
            <p className="text-[9px] text-white/35">{format(new Date(peakTime), "h:mm a")}</p>
          </div>
          {recoveryValue != null && (
            <>
              <span className="text-white/30">↓</span>
              <div className="text-center">
                <p className="text-2xl font-black text-white/80">{Math.round(recoveryValue)}</p>
                <p className="text-[9px] text-white/35">{recoveryTime ? format(new Date(recoveryTime), "h:mm a") : ""}</p>
              </div>
            </>
          )}
        </div>

        <p className="text-xs leading-relaxed text-white/50">
          Glucose rose {Math.round(rise)} mg/dL
          {recoveryMinutes != null
            ? `, then returned toward baseline in ${formatDuration(recoveryMinutes * 60000)}.`
            : " and had not fully returned to baseline by the last reading."}
        </p>
      </div>
    </DaySection>
  );
}