import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { computeDayGlucoseMetrics } from "@/lib/dayRecapMetrics";
import { computeMealOutcomes } from "@/lib/dayRecapAnalytics";
import { buildDayHistoryEvents, findLowestReading, isRescueCarb } from "@/lib/dayHistoryTimeline";
import { getRangeSummaryQualifier } from "@/lib/dailyBalanceState";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";
import DayGlucoseLine from "./DayGlucoseLine";
import DayMealSheet from "./DayMealSheet";
import DayTimelineSheet from "./DayTimelineSheet";

const HOUR_MS = 60 * 60 * 1000;

/**
 * One selected day, read plainly.
 *
 * A single cream reading surface: the day's status in words, the share of time
 * in the comfort zone, one glucose line, the day's lowest reading, the meals
 * that were logged, and a way into the full timeline. Insulin totals, stacked
 * insight/analysis/comparison panels and nested tile grids are deliberately not
 * here — the doses themselves stay reachable in the timeline.
 *
 * Every number comes from the app's existing calculations:
 *   - computeDayGlucoseMetrics → the same duration-weighted time-in-zone the
 *     Rhythms view and the month list use
 *   - getRangeSummaryQualifier → the approved range wording
 *   - computeMealOutcomes → the same meal analysis the meal review uses
 */
export default function DayRecap({
  dayDate: selectedDayDate,
  daySummary,
  glucose,
  carbs,
  insulin,
  loading,
  targetLow,
  targetHigh,
}) {
  const [selectedMealId, setSelectedMealId] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null);

  const metrics = useMemo(
    () => computeDayGlucoseMetrics(glucose, targetLow, targetHigh),
    [glucose, targetLow, targetHigh]
  );

  const chartPoints = useMemo(
    () =>
      (glucose || []).map((reading) => ({
        time: new Date(reading.recorded_at).getTime(),
        value: Number(reading.value),
      })),
    [glucose]
  );

  const mealOutcomes = useMemo(
    () => computeMealOutcomes(carbs, insulin, glucose),
    [carbs, insulin, glucose]
  );

  const mealRows = useMemo(() => {
    const outcomesById = new Map(mealOutcomes.map((outcome) => [outcome.id, outcome]));
    return (carbs || [])
      .filter((carb) => !isRescueCarb(carb))
      .map((carb) => ({ record: carb, timeMs: new Date(carb.consumed_at).getTime() }))
      .filter((meal) => Number.isFinite(meal.timeMs))
      .sort((a, b) => a.timeMs - b.timeMs)
      .map((meal) => ({ ...meal, outcome: outcomesById.get(meal.record.id) || null }));
  }, [carbs, mealOutcomes]);

  const selectedMeal = useMemo(
    () => mealRows.find((meal) => meal.record.id === selectedMealId) || null,
    [mealRows, selectedMealId]
  );

  const lowestReading = useMemo(() => findLowestReading(glucose), [glucose]);

  const timeline = useMemo(
    () => buildDayHistoryEvents({ carbs, insulin, glucose, targetLow }),
    [carbs, insulin, glucose, targetLow]
  );

  const dayDate = selectedDayDate
    || daySummary?.date
    || (lowestReading ? format(new Date(lowestReading.time), "yyyy-MM-dd") : null)
    || format(new Date(), "yyyy-MM-dd");
  const dayStartMs = new Date(`${dayDate}T00:00:00`).getTime();
  const dayLabel = format(parseISO(dayDate), "EEEE, MMMM d");
  const isToday = dayDate === format(new Date(), "yyyy-MM-dd");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  const hasReadings = metrics.hasData;
  const hasZoneShare = hasReadings && metrics.count >= 2 && metrics.tir != null;
  // Only the "mostly" range wording earns a headline of its own. Below that
  // tier the neutral heading plus the percentage and its caption carry the
  // reading, so the day is never graded and nothing is said twice.
  const rangeQualifier = hasZoneShare ? getRangeSummaryQualifier(metrics.tir) : null;
  const headline = rangeQualifier
    ? `${rangeQualifier}.`
    : hasZoneShare
      ? null
      : hasReadings
        ? "Only one reading."
        : "No readings recorded.";

  const belowZone = Boolean(
    lowestReading && Number.isFinite(targetLow) && lowestReading.value < targetLow
  );

  const openTimelineAt = (eventId) => {
    setHighlightId(eventId);
    setTimelineOpen(true);
  };

  return (
    <>
      <div className="editorial-surface rounded-2xl px-5 pb-3 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#746959" }}>
          {isToday ? "Today so far" : dayLabel}
        </p>

        {headline && (
          <h1
            className="mt-2 font-serif-italic text-[23px] leading-tight"
            style={{ color: "#3f3830" }}
          >
            {headline}
          </h1>
        )}

        {hasZoneShare && (
          <div className="mt-3">
            <p className="anchor-number" style={{ color: "#3f3830" }}>
              {metrics.tir}%
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "#3f3830" }}>
              of the time in your comfort zone
            </p>
            <p className="mt-1 text-xs tabular-nums" style={{ color: "#746959" }}>
              Your comfort zone: {formatGlucose(targetLow)}–{formatGlucose(targetHigh)} {glucoseUnitLabel()}
            </p>
          </div>
        )}

        {!hasZoneShare && (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "#746959" }}>
            {hasReadings
              ? "One reading is not enough to describe time in your comfort zone."
              : "Nothing was recorded from a sensor or a manual check on this day."}
          </p>
        )}

        <div className="pt-4">
          <DayGlucoseLine
            points={chartPoints}
            startMs={dayStartMs}
            endMs={dayStartMs + 24 * HOUR_MS}
            targetLow={targetLow}
            targetHigh={targetHigh}
            height={172}
            emptyMessage="No readings were recorded on this day."
          />
          <p className="pt-1 text-[10px]" style={{ color: "#746959" }}>
            Shaded area = your comfort zone.
          </p>
        </div>

        <p className="pt-2 text-[11px] leading-relaxed" style={{ color: "#746959" }}>
          Based on the readings saved for this day. The time between two readings is filled from
          the readings either side of it.
        </p>

        <div className="mt-4 border-t pt-4" style={{ borderColor: "#eadccf" }}>
          <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "#746959" }}>
            Lowest reading
          </p>
          {lowestReading ? (
            <>
              <p
                className="mt-1 text-lg font-semibold tabular-nums"
                style={{ color: belowZone ? "#9c3f2e" : "#3f3830" }}
              >
                {formatGlucose(lowestReading.value)}{" "}
                <span className="text-[11px] font-normal" style={{ color: "#746959" }}>
                  {glucoseUnitLabel()}
                </span>
              </p>
              <p className="text-xs tabular-nums" style={{ color: "#746959" }}>
                Recorded at {format(new Date(lowestReading.time), "h:mm a")}
              </p>
              <button
                type="button"
                onClick={() => openTimelineAt(timeline.lowestEventId)}
                className="mt-1 flex min-h-11 items-center gap-1 text-xs font-semibold"
                style={{ color: "#9c5228" }}
              >
                View in timeline
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "#746959" }}>
              No reading was recorded on this day, so there is nothing to point to.
            </p>
          )}
        </div>

        {mealRows.length > 0 && (
          <section className="mt-4 border-t pt-4" style={{ borderColor: "#eadccf" }}>
            <h2 className="section-label">Meals</h2>
            <ul>
              {mealRows.map((meal, index) => (
                <li
                  key={meal.record.id}
                  style={{ borderTop: index === 0 ? "none" : "1px solid #eadccf" }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedMealId(meal.record.id)}
                    className="flex min-h-11 w-full items-center gap-3 py-2.5 text-left transition active:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block break-words text-sm font-medium leading-snug"
                        style={{ color: "#3f3830" }}
                      >
                        {meal.record.food_name || meal.record.name || "Meal"}
                      </span>
                      <span className="mt-0.5 block text-xs tabular-nums" style={{ color: "#746959" }}>
                        {format(new Date(meal.timeMs), "h:mm a")} · {Math.round(Number(meal.record.carbs) || 0)} g carbs
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#a89e8d" }} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={() => openTimelineAt(null)}
          className="mt-4 flex min-h-[56px] w-full items-center gap-3 border-t pt-3 text-left transition active:opacity-60"
          style={{ borderColor: "#eadccf" }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium" style={{ color: "#3f3830" }}>
              Day timeline
            </span>
            <span className="mt-0.5 block text-xs" style={{ color: "#746959" }}>
              Meals, doses and glucose events
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#a89e8d" }} />
        </button>
      </div>

      <DayMealSheet
        open={Boolean(selectedMeal)}
        onClose={() => setSelectedMealId(null)}
        meal={selectedMeal}
        glucose={glucose}
        targetLow={targetLow}
        targetHigh={targetHigh}
      />

      <DayTimelineSheet
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        events={timeline.events}
        dayLabel={dayLabel}
        highlightId={highlightId}
      />
    </>
  );
}