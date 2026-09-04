import { format } from "date-fns";
import { Clock } from "lucide-react";
import DaySection from "./DaySection";

const EVENT_CONFIG = {
  meal: { color: "#f59e0b" },
  insulin: { color: "#5ba3b8" },
  peak: { color: "#d4a056" },
  low: { color: "#e07a6b" },
  rise: { color: "#d4a056" },
  fall: { color: "#5ba88a" },
  recovery: { color: "#5ba88a" },
};

export default function DayTimeline({ events }) {
  if (!events?.length) return null;

  return (
    <DaySection icon={Clock} iconColor="rgba(255,255,255,0.5)" label="Day Timeline" collapsible>
      <div className="relative space-y-2.5 pl-5">
        <div className="absolute left-[6px] top-1.5 bottom-1.5 w-px bg-white/10" />
        {events.map((event, i) => {
          const config = EVENT_CONFIG[event.type] || { color: "rgba(255,255,255,0.4)" };
          return (
            <div key={i} className="relative flex items-start gap-2">
              <div
                className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border"
                style={{ background: config.color, borderColor: "rgba(255,255,255,0.2)" }}
              />
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-white/80">{event.label}</span>
                  <span className="text-[9px] text-white/35">{format(new Date(event.time), "h:mm a")}</span>
                </div>
                {event.detail && <p className="text-[10px] text-white/40">{event.detail}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </DaySection>
  );
}