import { useEffect, useMemo, useState } from "react";
import MealReviewCard from "./MealReviewCard";
import MealReviewHero from "./MealReviewHero";
import TimelineCard from "./TimelineCard";
import MealAccordionRow from "./MealAccordionRow";
import MealReviewAtAGlance from "@/components/rightnow/MealReviewAtAGlance";
import { MR } from "./mealReviewTheme";
import { analyzeGlucoseResponse } from "@/lib/mealGlucoseResponse";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";
import { formatReadingAge } from "@/lib/glucoseStaleness";

/**
 * Meal Review — one card, one story.
 *
 * A single shared measured timeline for the window being reviewed, the window's
 * own figures beneath it, then every represented meal as a row that opens its
 * own details inline. Nothing that belongs to one meal is printed for another:
 * the chart and its figures are the window's, and the estimates live inside the
 * meal they came from.
 *
 * Works identically for one meal and for several overlapping ones.
 */



// Minutes as words, so a timing reads as a sentence rather than a code:
// "1 hr 11 min", "35 min".
function formatSpanWords(min) {
  if (!Number.isFinite(min) || min < 0) return null;
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const r = total % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

// Same clock boundaries as src/lib/mealSlot.js: morning 5-11, afternoon 11-17,
// evening 17-21. Late night has no period word, so the heading falls back to a
// neutral one.
function periodLabel(time) {
  if (!Number.isFinite(time)) return null;
  const hour = new Date(time).getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return null;
}

export default function MealReviewView({ meals = null, mealInsight = null, glucoseReadings, glucoseTrend }) {
  const now = Date.now();

  // One normalised list for both cases: several overlapping meals, or the
  // single meal the review has always shown. Newest first, and every id is
  // stable across readings so an open row stays open while glucose polls.
  const entries = useMemo(() => {
    const list = Array.isArray(meals) && meals.length
      ? meals
      : mealInsight
        ? [{ insight: mealInsight }]
        : [];

    return list
      .map((meal, index) => {
        const d = meal?.insight?.details || {};
        const time = meal?.mealTime ?? d.meal?.time ?? null;
        return {
          id: String(d.mealGroup?.id || d.meal?.id || time || `meal-${index}`),
          insight: meal?.insight,
          name: meal?.name || d.meal?.food_name || d.meal?.name || "Meal",
          time: Number.isFinite(time) ? time : null,
          carbs: Math.round(meal?.carbs ?? d.mealGroup?.carbs ?? d.meal?.carbs ?? 0),
          reviewWindowEnd: Number.isFinite(d.reviewWindowEnd) ? d.reviewWindowEnd : null,
          startGlucose: Number.isFinite(d.glucoseValue) ? d.glucoseValue : null,
          peakOutcome: Number.isFinite(d.peakOutcome) ? d.peakOutcome : null,
          latestGlucose: Number.isFinite(d.latestGlucoseValue)
            ? d.latestGlucoseValue
            : Number.isFinite(d.windowEndGlucoseValue)
              ? d.windowEndGlucoseValue
              : null,
          targetLow: d.targetLow || 70,
          targetHigh: d.targetHigh || 180,
          hasMeal: Boolean(d.meal),
        };
      })
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  }, [meals, mealInsight]);

  const idsKey = entries.map((entry) => entry.id).join("|");
  const [openIds, setOpenIds] = useState([]);

  // Meals start closed. Refreshes preserve only the user's explicit choices;
  // newly arriving meals never open automatically.
  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    setOpenIds((prev) => prev.filter((id) => ids.includes(id)));
  }, [idsKey]);

  const toggleMeal = (id) =>
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((openId) => openId !== id) : [...prev, id]));

  const times = entries.map((entry) => entry.time).filter(Number.isFinite);
  const ends = entries.map((entry) => entry.reviewWindowEnd).filter(Number.isFinite);
  const windowFrom = times.length ? Math.min(...times) : null;
  const windowTo = ends.length ? Math.max(...ends) : now;

  const startValues = entries.filter((entry) => entry.time === windowFrom && Number.isFinite(entry.startGlucose));
  const windowStartValue = startValues.length ? startValues[0].startGlucose : null;

  const primary = entries[0] || null;
  const targetLow = primary?.targetLow ?? 70;
  const targetHigh = primary?.targetHigh ?? 180;
  const singleMeal = entries.length === 1;

  const analysis = useMemo(() => {
    if (!Number.isFinite(windowFrom)) return {};
    return analyzeGlucoseResponse(glucoseReadings, windowFrom, targetLow, targetHigh, now, windowStartValue);
  }, [glucoseReadings, windowFrom, targetLow, targetHigh, windowStartValue]);

  const readings = Array.isArray(glucoseReadings) ? glucoseReadings : [];
  const latestReadingTime = readings.reduce((best, reading) => {
    const t = new Date(reading?.recorded_at).getTime();
    if (!Number.isFinite(t) || t > now) return best;
    return best == null || t > best ? t : best;
  }, null);
  const readingAgeMin = latestReadingTime != null ? (now - latestReadingTime) / 60000 : null;
  const hasPostMealReading =
    Number.isFinite(windowFrom) && readings.some((reading) => new Date(reading?.recorded_at).getTime() > windowFrom);

  // Direction is only spoken when the app already computed it from several
  // recent readings and the newest reading is current. Otherwise the sentence
  // is left out entirely rather than filled with a guess.
  const trendPhrase = glucoseTrend?.word || null;
  const showDirection = Boolean(trendPhrase) && readingAgeMin != null && readingAgeMin <= 20;
  const sentence = showDirection ? `Your glucose is ${trendPhrase} now.` : null;

  const period = periodLabel(windowFrom);
  const headline = period ? `Your ${period}, so far` : "Since you ate";
  const headlineItalic = period ? "so far" : null;

  const glucoseNow = primary?.latestGlucose ?? primary?.startGlucose ?? null;
  const reading = Number.isFinite(glucoseNow)
    ? {
        value: formatGlucose(glucoseNow),
        unit: glucoseUnitLabel(),
        trend: showDirection ? trendPhrase : null,
        freshness: latestReadingTime != null ? formatReadingAge(latestReadingTime) : null,
      }
    : null;

  if (!entries.length || !primary?.hasMeal) {
    return (
      <MealReviewCard>
        <div className="space-y-1 px-6 py-5">
          <p style={{ fontSize: 14, fontWeight: 600, color: MR.ink }}>Meal review is gathering</p>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: MR.sec }}>
            Once your most recent nourishment and support are in, the review opens here.
          </p>
        </div>
      </MealReviewCard>
    );
  }

  // The window's own figures, labelled as the window's. A single meal's peak
  // timing is valid for that meal; with several meals it is not attributed.
  const stats = [];
  if (hasPostMealReading && Number.isFinite(analysis.timeInRangePct)) {
    stats.push({ label: "In target range", value: `${Math.round(analysis.timeInRangePct)}% of this window` });
  }
  if (hasPostMealReading && Number.isFinite(analysis.backInRangeMin)) {
    stats.push({ label: "Back in range", value: `${formatSpanWords(analysis.backInRangeMin)} after eating` });
  }
  if (singleMeal && Number.isFinite(primary.peakOutcome) && Number.isFinite(analysis.timeToPeakMin)) {
    stats.push({
      label: "Peak",
      value: `${formatGlucose(primary.peakOutcome)} · ${formatSpanWords(analysis.timeToPeakMin)} after this meal`,
    });
  }

  const note = singleMeal
    ? null
    : `${entries.length} meals share this timeline. These figures describe the window as a whole, not one meal.`;

  const chartProps = {
    glucoseReadings,
    from: windowFrom,
    to: windowTo,
    now,
    targetLow,
    targetHigh,
    markers: singleMeal ? [] : entries.map((entry) => ({ time: entry.time, name: entry.name })),
    startValue: singleMeal ? primary.startGlucose : windowStartValue,
    peakValue: singleMeal ? primary.peakOutcome : null,
    timeToPeakMin: singleMeal ? analysis.timeToPeakMin : null,
    allowHighest: !singleMeal,
    peakMode: singleMeal ? "peak" : "highest",
  };

  return (
    <div className="space-y-4 pb-2">
      <MealReviewHero
        eyebrow={singleMeal ? "Meal review" : `Meal review · ${entries.length} meals`}
        headline={headline}
        headlineItalic={headlineItalic}
        sentence={sentence}
        reading={reading}
      />

      <TimelineCard
        title="Your glucose"
        stats={stats}
        note={note}
        chartProps={chartProps}
      >
        {entries.map((entry, index) => (
          <MealAccordionRow
            key={entry.id}
            first={index === 0}
            name={entry.name}
            time={formatClock(entry.time)}
            carbs={entry.carbs}
            open={openIds.includes(entry.id)}
            onToggle={() => toggleMeal(entry.id)}
          >
            <MealReviewAtAGlance mealInsight={entry.insight} glucoseReadings={glucoseReadings} />
          </MealAccordionRow>
        ))}
      </TimelineCard>
    </div>
  );
}