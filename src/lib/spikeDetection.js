// Client-side spike detection for the ActivityGraph.
// A "spike" is a rapid, sustained glucose rise — the kind the user might want
// to reflect on (stress, dawn effect, a meal, a workout, etc.).
// Detection runs on the already-loaded glucose readings, so there is no
// backend round-trip: icons appear instantly when the graph renders.

const MINUTE_MS = 60 * 1000;

const DEFAULTS = {
  minRiseMgDl: 40,       // total rise needed to count as a spike
  minRatePerMin: 2,      // mg/dL/min to start a spike
  sustainRatePerMin: 0.5, // rate above which the spike is still "rising"
  minDurationMinutes: 45,
  maxGapMinutes: 15,      // gaps larger than this break a spike run
};

export function detectSpikes(glucoseReadings, options = {}) {
  const config = { ...DEFAULTS, ...options };

  const readings = (Array.isArray(glucoseReadings) ? glucoseReadings : [])
    .map((r) => ({
      time: new Date(r.recorded_at || r.created_at || r.created_date).getTime(),
      value: Number(r.value ?? r.glucose ?? r.mgdl ?? r.mg_dL),
    }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);

  if (readings.length < 3) return [];

  const spikes = [];
  let i = 0;

  while (i < readings.length - 1) {
    const gap = readings[i + 1].time - readings[i].time;
    if (gap <= 0 || gap > config.maxGapMinutes * MINUTE_MS) {
      i++;
      continue;
    }

    const rate = (readings[i + 1].value - readings[i].value) / (gap / MINUTE_MS);

    if (rate < config.minRatePerMin) {
      i++;
      continue;
    }

    // Potential spike started — extend the run while glucose keeps climbing
    const startTime = readings[i].time;
    const startGlucose = readings[i].value;
    let peakGlucose = readings[i + 1].value;
    let peakTime = readings[i + 1].time;
    let j = i + 1;

    while (j < readings.length - 1) {
      const nextGap = readings[j + 1].time - readings[j].time;
      if (nextGap <= 0 || nextGap > config.maxGapMinutes * MINUTE_MS) break;

      const nextRate =
        (readings[j + 1].value - readings[j].value) / (nextGap / MINUTE_MS);

      if (readings[j + 1].value > peakGlucose) {
        peakGlucose = readings[j + 1].value;
        peakTime = readings[j + 1].time;
      }

      // Stop when the rise clearly stalls or reverses
      if (nextRate < config.sustainRatePerMin) break;

      j++;
    }

    const riseAmount = peakGlucose - startGlucose;
    const durationMinutes = (peakTime - startTime) / MINUTE_MS;

    if (
      riseAmount >= config.minRiseMgDl &&
      durationMinutes >= config.minDurationMinutes
    ) {
      spikes.push({
        startTime: new Date(startTime).toISOString(),
        peakTime: new Date(peakTime).toISOString(),
        startGlucose: Math.round(startGlucose),
        peakGlucose: Math.round(peakGlucose),
        riseAmount: Math.round(riseAmount),
        durationMinutes: Math.round(durationMinutes),
        rateOfRise: Math.round((riseAmount / durationMinutes) * 10) / 10,
      });
    }

    i = j + 1;
  }

  // Deduplicate spikes that overlap significantly (keep the larger rise)
  return deduplicateSpikes(spikes);
}

function deduplicateSpikes(spikes) {
  if (spikes.length < 2) return spikes;
  const sorted = spikes.slice().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const result = [sorted[0]];
  for (let k = 1; k < sorted.length; k++) {
    const prev = result[result.length - 1];
    const curr = sorted[k];
    const prevStart = new Date(prev.startTime).getTime();
    const prevEnd = new Date(prev.peakTime).getTime();
    const currStart = new Date(curr.startTime).getTime();
    // If overlapping within 15 minutes, keep the bigger rise
    if (currStart - prevEnd < 15 * MINUTE_MS) {
      if (curr.riseAmount > prev.riseAmount) {
        result[result.length - 1] = curr;
      }
    } else {
      result.push(curr);
    }
  }
  return result;
}