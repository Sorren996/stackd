import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";

const PLOT_HEIGHT = 132;
const SAGE = "#5b6550";
const TICKS = [100, 50, 0];

/**
 * One bar per calendar day in the selected period, on a fixed 0–100% baseline.
 * A day with no readings is drawn as an empty dashed slot, never a 0% bar.
 * Tapping a day opens that day in the journal; arrow keys move between days and
 * Enter opens one, with the value announced through the readout line.
 */
export default function DayByDayBars({ series }) {
  const navigate = useNavigate();
  const stripRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(null);

  const gap = series.length <= 14 ? 2 : 1;

  const labelIndices = useMemo(() => {
    const last = series.length - 1;
    if (series.length <= 7) return series.map((_, i) => i);
    return [0, Math.round(last / 3), Math.round((last * 2) / 3), last];
  }, [series]);

  const dayText = (day) => {
    if (!day.count) return "no readings";
    if (day.tir == null) return "not enough readings";
    return `${day.tir}% in your comfort zone`;
  };

  const openDay = (index) => {
    const day = series[index];
    if (!day || !day.count) return;
    navigate(`/history?day=${day.date}`);
  };

  const handlePointer = (event) => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(series.length - 1, Math.max(0, Math.floor(ratio * series.length)));
    setActiveIndex(index);
    openDay(index);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const base = activeIndex == null ? series.length - 1 : activeIndex;
      const next = Math.min(series.length - 1, Math.max(0, base + (event.key === "ArrowRight" ? 1 : -1)));
      setActiveIndex(next);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDay(activeIndex == null ? series.length - 1 : activeIndex);
    }
  };

  const active = activeIndex != null ? series[activeIndex] : null;

  return (
    <div>
      <p id="insights-day-readout" aria-live="polite" className="text-[11px]" style={{ color: "#6b6153" }}>
        {active ? `${format(parseISO(active.date), "MMM d")} · ${dayText(active)}` : "Tap a day to see its details."}
      </p>

      <div className="mt-2 flex gap-1.5">
        <div className="relative w-6 shrink-0" style={{ height: PLOT_HEIGHT }} aria-hidden="true">
          {TICKS.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[9px] tabular-nums"
              style={{ top: `${100 - tick}%`, color: "#746959" }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {TICKS.map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 border-t"
                style={{ top: `${100 - tick}%`, borderColor: tick === 0 ? "#d8cec2" : "#efe5d8" }}
              />
            ))}
          </div>

          <div
            ref={stripRef}
            role="group"
            tabIndex={0}
            aria-label={`Time in your comfort zone, each of the ${series.length} days in this period`}
            aria-describedby="insights-day-readout"
            onKeyDown={handleKeyDown}
            onClick={handlePointer}
            className="relative flex items-end rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ height: PLOT_HEIGHT, gap, touchAction: "manipulation" }}
          >
            {series.map((day, i) => (
              <div key={day.date} className="flex h-full min-w-0 flex-1 items-end" aria-hidden="true">
                {day.count === 0 || day.tir == null ? (
                  <div
                    className="h-full w-full rounded-[3px] border border-dashed"
                    style={{ borderColor: "#d8cec2" }}
                  />
                ) : (
                  <div
                    className="w-full rounded-t-[3px]"
                    style={{
                      height: `${Math.max(day.tir, 1)}%`,
                      background: SAGE,
                      opacity: activeIndex === i ? 1 : 0.62,
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="relative mt-1.5 h-3">
            {labelIndices.map((i) => (
              <span
                key={series[i].date}
                className="absolute top-0 whitespace-nowrap text-[9px]"
                style={{
                  left: `${((i + 0.5) / series.length) * 100}%`,
                  transform: `translateX(${i === 0 ? 0 : i === series.length - 1 ? -100 : -50}%)`,
                  color: "#746959",
                }}
              >
                {series[i].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-[10px]" style={{ color: "#746959" }}>
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-[2px] border border-dashed"
          style={{ borderColor: "#d8cec2" }}
          aria-hidden="true"
        />
        Gap = no readings
      </p>

      <ul className="sr-only">
        {series.map((day) => (
          <li key={day.date}>
            {format(parseISO(day.date), "MMMM d")}: {dayText(day)}
          </li>
        ))}
      </ul>
    </div>
  );
}