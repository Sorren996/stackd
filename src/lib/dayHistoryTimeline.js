/**
 * The honest, in-order record of one selected day.
 *
 * Only things that were actually STORED become entries here: logged
 * carbohydrates, logged insulin doses, and real glucose readings. Nothing is
 * inferred — there are no "peak", "rising", "falling" or "recovery" events,
 * because those are derived descriptions rather than recorded entries, and a
 * derived event can never be located in the record.
 *
 * Glucose readings appear only where they carry information a follower of the
 * day would act on: every reading that sat outside the comfort zone (an actual
 * low is the one that matters historically), plus the day's single lowest
 * reading so the overview's "View in timeline" always has a real row to land
 * on. A within-zone minimum is labelled "Lowest reading", never a low event.
 *
 * Each stored record produces exactly one entry, keyed by its own id, so a row
 * can be highlighted without duplicating anything.
 */

export function normalizeDayReadings(glucose) {
  return (Array.isArray(glucose) ? glucose : [])
    .map((reading) => ({
      id: reading.id,
      time: new Date(reading.recorded_at).getTime(),
      value: Number(reading.value),
    }))
    .filter((reading) => Number.isFinite(reading.time) && Number.isFinite(reading.value))
    .sort((a, b) => a.time - b.time);
}

/** The day's lowest real reading, or null when the day has none. */
export function findLowestReading(glucose) {
  const readings = normalizeDayReadings(glucose);
  if (!readings.length) return null;
  return readings.reduce((lowest, reading) => (reading.value < lowest.value ? reading : lowest));
}

export function isRescueCarb(carb) {
  return carb?.is_rescue_carb === true || carb?.classification === "rescue_carbs";
}

/**
 * @returns {{events: Array, lowestEventId: string|null}}
 *   events — ascending by time, each { id, kind, time, title, carbs?, units?, value?, recordId? }
 *   lowestEventId — id of the entry for the day's lowest reading
 */
export function buildDayHistoryEvents({ carbs, insulin, glucose, targetLow }) {
  const events = [];

  for (const carb of Array.isArray(carbs) ? carbs : []) {
    const time = new Date(carb.consumed_at).getTime();
    if (!Number.isFinite(time)) continue;
    const rescue = isRescueCarb(carb);
    events.push({
      id: `carb:${carb.id}`,
      kind: rescue ? "rescue" : "meal",
      time,
      title: carb.food_name || carb.name || (rescue ? "Rescue carb" : "Meal"),
      carbs: Number(carb.carbs) || 0,
      recordId: carb.id,
    });
  }

  for (const dose of Array.isArray(insulin) ? insulin : []) {
    const time = new Date(dose.administered_at).getTime();
    if (!Number.isFinite(time)) continue;
    events.push({
      id: `dose:${dose.id}`,
      kind: "dose",
      time,
      title: dose.insulin_type || "Insulin",
      units: Number(dose.units) || 0,
      recordId: dose.id,
    });
  }

  const readings = normalizeDayReadings(glucose);
  const lowest = readings.length
    ? readings.reduce((low, reading) => (reading.value < low.value ? reading : low))
    : null;

  for (const reading of readings) {
    const isLow = Number.isFinite(targetLow) && reading.value < targetLow;
    const isLowest = lowest && reading.id === lowest.id;
    if (!isLow && !isLowest) continue;
    events.push({
      id: `reading:${reading.id}`,
      kind: "reading",
      isLow,
      time: reading.time,
      title: isLow ? "Low glucose reading" : "Lowest reading",
      value: reading.value,
      recordId: reading.id,
    });
  }

  events.sort((a, b) => a.time - b.time);

  return {
    events,
    lowestEventId: lowest ? `reading:${lowest.id}` : null,
  };
}