// Client-side spike detection for the ActivityGraph.
// A "spike" is a rapid, sustained glucose rise — the kind the user might want
// to reflect on (stress, dawn effect, a meal, a workout, etc.).
//
// Detection is purely rate-of-climb based, aligned with Dexcom G7's approach:
// G7 flags "Rising Fast" at 2 mg/dL/min. We use the same threshold to start
// a spike, and allow brief plateaus (up to 2 readings) so that a continuous
// rise with a momentary pause is treated as a single event rather than
// fragmenting into multiple markers.

const MINUTE_MS = 60 * 1000;

const DEFAULTS = {
  minRiseMgDl: 40,         // total rise needed to qualify as a spike
  minRatePerMin: 2,        // Dexcom G7 "Rising Fast" threshold (mg/dL/min)
  sustainRatePerMin: 1,    // rate above which the spike is still "rising" (Dexcom "rising" = +1 mg/dL/min)
  maxPlateauReadings: 2,   // brief plateaus allowed before a spike ends
  declineBreakMgDl: 5,     // a drop of this much ends the spike immediately
  maxGapMinutes: 15,       // gaps larger than this break a spike run
};

// Generates assumed (interpolated) readings between real readings when gaps
// exceed maxGapMinutes. These are purely client-side — never stored in the DB —
// and exist so daily balance and spike detection see a continuous timeline even
// when the user has gaps between manual or CGM readings.
export function generateAssumedReadings(glucoseReadings, maxGapMinutes = 5) {
  const readings = (Array.isArray(glucoseReadings) ? glucoseReadings : [])
    .map((r) => ({
      time: new Date(r.recorded_at || r.created_at || r.created_date).getTime(),
      value: Number(r.value ?? r.glucose ?? r.mgdl ?? r.mg_dL),
    }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);

  if (readings.length < 2) return readings;

  const stepMs = maxGapMinutes * 60 * 1000;
  const result = [readings[0]];

  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];
    const gapMs = curr.time - prev.time;

    if (gapMs > stepMs) {
      let t = prev.time + stepMs;
      while (t < curr.time - stepMs / 2) {
        const fraction = (t - prev.time) / (curr.time - prev.time);
        result.push({
          time: t,
          value: Math.round(prev.value + (curr.value - prev.value) * fraction),
        });
        t += stepMs;
      }
    }

    result.push(curr);
  }

  return result;
}

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

  const maxGapMs = config.maxGapMinutes * MINUTE_MS;
  const spikes = [];
  let i = 0;

  while (i < readings.length - 1) {
    const gap = readings[i + 1].time - readings[i].time;
    if (gap <= 0 || gap > maxGapMs) { i++; continue; }

    const rate = (readings[i + 1].value - readings[i].value) / (gap / MINUTE_MS);
    if (rate < config.minRatePerMin) { i++; continue; }

    // Spike started — extend while glucose continues climbing, tolerating
    // brief plateaus so a continuous rise doesn't fragment.
    const startTime = readings[i].time;
    const startGlucose = readings[i].value;
    let peakGlucose = readings[i + 1].value;
    let peakTime = readings[i + 1].time;
    let j = i + 1;
    let plateauCount = 0;

    while (j < readings.length - 1) {
      const nextGap = readings[j + 1].time - readings[j].time;
      if (nextGap <= 0 || nextGap > maxGapMs) break;

      const nextRate = (readings[j + 1].value - readings[j].value) / (nextGap / MINUTE_MS);

      if (readings[j + 1].value > peakGlucose) {
        peakGlucose = readings[j + 1].value;
        peakTime = readings[j + 1].time;
      }

      // A clear decline ends the spike immediately
      if (readings[j + 1].value < readings[j].value - config.declineBreakMgDl) break;

      // Allow brief plateaus before ending the spike
      if (nextRate < config.sustainRatePerMin) {
        plateauCount++;
        if (plateauCount > config.maxPlateauReadings) break;
      } else {
        plateauCount = 0;
      }

      j++;
    }

    const riseAmount = peakGlucose - startGlucose;
    const durationMinutes = (peakTime - startTime) / MINUTE_MS;

    if (riseAmount >= config.minRiseMgDl) {
      spikes.push({
        startTime: new Date(startTime).toISOString(),
        peakTime: new Date(peakTime).toISOString(),
        startGlucose: Math.round(startGlucose),
        peakGlucose: Math.round(peakGlucose),
        riseAmount: Math.round(riseAmount),
        durationMinutes: Math.round(durationMinutes),
        rateOfRise: Math.round((riseAmount / Math.max(1, durationMinutes)) * 10) / 10,
      });
    }

    i = j + 1;
  }

  // Deduplicate spikes that overlap or sit close together (keep the larger rise)
  return deduplicateSpikes(spikes);
}

function deduplicateSpikes(spikes) {
  if (spikes.length < 2) return spikes;
  const sorted = spikes.slice().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const result = [sorted[0]];
  for (let k = 1; k < sorted.length; k++) {
    const prev = result[result.length - 1];
    const curr = sorted[k];
    const prevEnd = new Date(prev.peakTime).getTime();
    const currStart = new Date(curr.startTime).getTime();
    // Merge if within 20 minutes of the previous spike's peak
    if (currStart - prevEnd < 20 * MINUTE_MS) {
      if (curr.riseAmount > prev.riseAmount) {
        result[result.length - 1] = curr;
      }
    } else {
      result.push(curr);
    }
  }
  return result;
}