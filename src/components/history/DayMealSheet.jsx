import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import HistoricalSheet from "./HistoricalSheet";
import DayGlucoseLine from "./DayGlucoseLine";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const BEFORE_MINUTES = 30;
const AFTER_HOURS = 3;

function Row({ label, value, unit, qualified }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t py-3" style={{ borderColor: "#eadccf" }}>
      <p className="text-sm" style={{ color: "#3f3830" }}>
        {label}
        {qualified && (
          <span className="block pt-0.5 text-[11px] leading-relaxed" style={{ color: "#746959" }}>
            {qualified}
          </span>
        )}
      </p>
      {value == null ? (
        <p className="shrink-0 text-sm" style={{ color: "#746959" }}>No reading</p>
      ) : (
        <p className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: "#3f3830" }}>
          {value}{" "}
          <span className="text-[11px] font-normal" style={{ color: "#746959" }}>{unit}</span>
        </p>
      )}
    </div>
  );
}

/**
 * One meal, read plainly: the glucose line around it and the two numbers that
 * describe it. Values come from the existing meal analysis — nothing is
 * recomputed here, and a window that is still open is named as such rather
 * than presented as a final peak.
 */
export default function DayMealSheet({ open, onClose, meal, glucose, targetLow, targetHigh }) {
  const [notesOpen, setNotesOpen] = useState(false);

  const record = meal?.record || null;
  const outcome = meal?.outcome || null;
  const mealMs = record ? new Date(record.consumed_at).getTime() : null;
  const notes = typeof record?.notes === "string" ? record.notes.trim() : "";

  const window = useMemo(() => {
    if (!Number.isFinite(mealMs)) return { points: [], complete: false, lastReadingMs: null };
    const start = mealMs - BEFORE_MINUTES * MIN_MS;
    const end = mealMs + AFTER_HOURS * HOUR_MS;
    const points = (Array.isArray(glucose) ? glucose : [])
      .map((reading) => ({
        time: new Date(reading.recorded_at).getTime(),
        value: Number(reading.value),
      }))
      .filter((reading) => Number.isFinite(reading.time) && Number.isFinite(reading.value))
      .sort((a, b) => a.time - b.time)
      .filter((reading) => reading.time >= start && reading.time <= end);

    const lastReadingMs = points.length ? points[points.length - 1].time : null;
    // A window is only complete once readings run to its end (allowing for the
    // CGM's ~5 minute cadence).
    const complete = Number.isFinite(lastReadingMs) && lastReadingMs >= end - 15 * MIN_MS;
    return { points, complete, lastReadingMs, end };
  }, [glucose, mealMs]);

  if (!record) {
    return <HistoricalSheet open={open} onClose={onClose} title="This meal" />;
  }

  const title = record.food_name || record.name || "Meal";
  const time = format(new Date(mealMs), "h:mm a");
  const carbs = Math.round(Number(record.carbs) || 0);
  const unit = glucoseUnitLabel();

  return (
    <HistoricalSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={`${time} · ${carbs} g carbs`}
    >
      <h3 className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
        Glucose around this meal
      </h3>

      <div className="pt-2">
        <DayGlucoseLine
          points={window.points}
          startMs={mealMs - BEFORE_MINUTES * MIN_MS}
          endMs={mealMs + AFTER_HOURS * HOUR_MS}
          targetLow={targetLow}
          targetHigh={targetHigh}
          mode="meal"
          mealMs={mealMs}
          height={168}
          emptyMessage="There are not enough readings around this meal to draw a line."
        />
        <p className="pt-1 text-[10px]" style={{ color: "#746959" }}>
          Shaded area = your comfort zone.
        </p>
      </div>

      <div className="pt-3">
        <Row
          label="Before the meal"
          value={outcome ? formatGlucose(outcome.startingGlucose) : null}
          unit={unit}
        />
        <Row
          label={window.complete ? "Highest afterward" : "Highest so far"}
          value={outcome ? formatGlucose(outcome.peakGlucose) : null}
          unit={unit}
          qualified={
            !outcome
              ? "There are not enough readings around this meal to show a value."
              : !window.complete && Number.isFinite(window.lastReadingMs)
                ? `Readings around this meal run to ${format(new Date(window.lastReadingMs), "h:mm a")}, so this is not a final peak.`
                : null
          }
        />
      </div>

      <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "#746959" }}>
        Food, insulin and other factors can affect these readings.
      </p>

      {notes && (
        <div className="pt-3">
          <button
            type="button"
            onClick={() => setNotesOpen((open) => !open)}
            aria-expanded={notesOpen}
            className="flex min-h-11 items-center gap-1 text-xs font-semibold"
            style={{ color: "#9c5228" }}
          >
            {notesOpen ? "Hide meal notes" : "View meal notes"}
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: notesOpen ? "rotate(90deg)" : "none" }}
            />
          </button>
          {notesOpen && (
            <p
              className="mt-1 whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-xs leading-relaxed"
              style={{ background: "#f7f1e8", color: "#3f3830" }}
            >
              {notes}
            </p>
          )}
        </div>
      )}
    </HistoricalSheet>
  );
}