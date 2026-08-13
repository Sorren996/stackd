const HOUR_MS = 60 * 60 * 1000;

/**
 * Buckets glucose readings into hourly candles for the 24h candlestick view.
 * Each candle captures the high, low, and average glucose within its window.
 */
export function bucketGlucoseForCandles(readings, domainStart, domainEnd, bucketMs = HOUR_MS) {
  const buckets = [];
  for (let t = domainStart; t < domainEnd; t += bucketMs) {
    const inRange = readings.filter((r) => r.time >= t && r.time < t + bucketMs);
    if (!inRange.length) {
      buckets.push({ time: t, high: null, low: null, avg: null, count: 0 });
    } else {
      const values = inRange.map((r) => r.value);
      buckets.push({
        time: t,
        high: Math.max(...values),
        low: Math.min(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        count: values.length,
      });
    }
  }
  return buckets;
}

/**
 * Buckets insulin doses into hourly bars for the 24h summary strip.
 * Returns total units and the underlying doses per hour.
 */
export function bucketInsulinForBars(doses, domainStart, domainEnd, bucketMs = HOUR_MS) {
  const buckets = {};
  for (let t = domainStart; t < domainEnd; t += bucketMs) {
    buckets[t] = { time: t, units: 0, doses: [] };
  }
  for (const dose of doses) {
    const time = new Date(dose.administered_at || dose.created_at || dose.created_date).getTime();
    if (!Number.isFinite(time) || time < domainStart || time >= domainEnd) continue;
    const bucketTime = Math.floor((time - domainStart) / bucketMs) * bucketMs + domainStart;
    if (buckets[bucketTime]) {
      buckets[bucketTime].units += Number(dose.units) || 0;
      buckets[bucketTime].doses.push(dose);
    }
  }
  return Object.values(buckets);
}

/**
 * Bundles detected spikes into hourly groups so the 24h view can show
 * a single count badge instead of overlapping arrows.
 */
export function bucketSpikes(spikes, domainStart, domainEnd, bucketMs = HOUR_MS) {
  const buckets = {};
  for (let t = domainStart; t < domainEnd; t += bucketMs) {
    buckets[t] = { time: t, count: 0, spikes: [], maxRise: 0 };
  }
  for (const spike of spikes) {
    const time = new Date(spike.startTime).getTime();
    if (!Number.isFinite(time) || time < domainStart || time >= domainEnd) continue;
    const bucketTime = Math.floor((time - domainStart) / bucketMs) * bucketMs + domainStart;
    if (buckets[bucketTime]) {
      buckets[bucketTime].count++;
      buckets[bucketTime].spikes.push(spike);
      buckets[bucketTime].maxRise = Math.max(buckets[bucketTime].maxRise, spike.riseAmount || 0);
    }
  }
  return Object.values(buckets);
}