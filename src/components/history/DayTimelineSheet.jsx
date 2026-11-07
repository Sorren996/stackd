import { useEffect, useRef } from "react";
import { format } from "date-fns";
import HistoricalSheet from "./HistoricalSheet";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";

const DOT = { meal: "#5b6550", rescue: "#a89e8d", dose: "#8a9488", reading: "#a89e8d" };

function detailFor(event) {
  if (event.kind === "dose") return `${event.units} units`;
  if (event.carbs != null) {
    const carbs = `${Math.round(event.carbs)} g carbs`;
    return event.kind === "rescue" ? `${carbs} · rescue carbs` : carbs;
  }
  if (event.value != null) return `${formatGlucose(event.value)} ${glucoseUnitLabel()}`;
  return "";
}

/**
 * Everything actually recorded that day, in time order: logged meals, each
 * logged dose as its own single entry, and the glucose readings that matter
 * historically (lows below the comfort zone, plus the day's lowest reading).
 */
export default function DayTimelineSheet({ open, onClose, events, dayLabel, highlightId }) {
  const rowRefs = useRef({});

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      rowRefs.current[highlightId]?.scrollIntoView?.({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, highlightId, events]);

  return (
    <HistoricalSheet
      open={open}
      onClose={onClose}
      title="Day timeline"
      subtitle={`${dayLabel} · What was recorded, in time order.`}
    >
      {!events.length ? (
        <p className="pt-2 text-sm leading-relaxed" style={{ color: "#746959" }}>
          Nothing was recorded on this day.
        </p>
      ) : (
        <ul className="pt-1">
          {events.map((event, index) => {
            const highlighted = event.id === highlightId;
            const low = event.kind === "reading" && event.isLow;
            return (
              <li
                key={event.id}
                ref={(node) => {
                  rowRefs.current[event.id] = node;
                }}
                className="flex items-start gap-3 rounded-lg py-2.5 pr-2"
                style={{
                  borderTop: index === 0 ? "none" : "1px solid #eadccf",
                  background: highlighted ? "rgba(156, 82, 40, 0.08)" : "transparent",
                  paddingLeft: highlighted ? 8 : 0,
                }}
              >
                <span
                  className="w-[68px] shrink-0 whitespace-nowrap text-[11px] tabular-nums"
                  style={{ color: "#746959" }}
                >
                  {format(new Date(event.time), "h:mm a")}
                </span>
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: low ? "#9c3f2e" : DOT[event.kind] || DOT.reading }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="block break-words text-sm leading-snug"
                    style={{ color: low ? "#9c3f2e" : "#3f3830", fontWeight: low ? 600 : 400 }}
                  >
                    {event.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] tabular-nums" style={{ color: "#746959" }}>
                    {detailFor(event)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </HistoricalSheet>
  );
}