// Shared spike-detection math extracted from the scheduled scanner so it can
// run incrementally (on new glucose readings) instead of scanning all users
// every 5 minutes. The algorithm, thresholds, and dedup logic are identical
// to the original scanForSpikes implementation — only the caller changed.

const MINUTE_MS = 60 * 1000;

export const SPIKE_DETECTION = {
  minRiseMgDl: 40,
  minRatePerMin: 2,
  sustainRatePerMin: 1,
  maxPlateauReadings: 2,
  declineBreakMgDl: 5,
  maxGapMinutes: 15,
};

export function generateAssumedReadings(readings: { time: number; value: number }[], maxGapMinutes: number): { time: number; value: number }[] {
  if (readings.length < 2) return readings;
  const stepMs = maxGapMinutes * 60 * 1000;
  const result = [readings[0]];
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];
    if (curr.time - prev.time > stepMs) {
      let t = prev.time + stepMs;
      while (t < curr.time - stepMs / 2) {
        const fraction = (t - prev.time) / (curr.time - prev.time);
        result.push({ time: t, value: Math.round(prev.value + (curr.value - prev.value) * fraction) });
        t += stepMs;
      }
    }
    result.push(curr);
  }
  return result;
}

function detectRateSpikes(readings: { time: number; value: number }[]): any[] {
  if (readings.length < 3) return [];

  const maxGapMs = SPIKE_DETECTION.maxGapMinutes * MINUTE_MS;
  const spikes: any[] = [];
  let i = 0;

  while (i < readings.length - 1) {
    const gap = readings[i + 1].time - readings[i].time;
    if (gap <= 0 || gap > maxGapMs) { i++; continue; }

    const rate = (readings[i + 1].value - readings[i].value) / (gap / MINUTE_MS);
    if (rate < SPIKE_DETECTION.minRatePerMin) { i++; continue; }

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

      if (readings[j + 1].value < readings[j].value - SPIKE_DETECTION.declineBreakMgDl) break;

      if (nextRate < SPIKE_DETECTION.sustainRatePerMin) {
        plateauCount++;
        if (plateauCount > SPIKE_DETECTION.maxPlateauReadings) break;
      } else {
        plateauCount = 0;
      }

      j++;
    }

    const riseAmount = peakGlucose - startGlucose;
    const durationMinutes = (peakTime - startTime) / MINUTE_MS;

    if (riseAmount >= SPIKE_DETECTION.minRiseMgDl) {
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

  return spikes;
}

function deduplicateSpikes(spikes: any[]): any[] {
  if (spikes.length < 2) return spikes;
  const sorted = spikes.slice().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const result = [sorted[0]];
  for (let k = 1; k < sorted.length; k++) {
    const prev = result[result.length - 1];
    const curr = sorted[k];
    const prevEnd = new Date(prev.peakTime).getTime();
    const currStart = new Date(curr.startTime).getTime();
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

export function detectSpikes(readings: { time: number; value: number }[]): any[] {
  return deduplicateSpikes(detectRateSpikes(readings));
}

// Convert raw GlucoseReading records into the sorted {time, value} format the
// detector expects, filtering out system carry-forward readings.
export function readingsForDetection(glucoseReadings: any[]): { time: number; value: number }[] {
  return (Array.isArray(glucoseReadings) ? glucoseReadings : [])
    .filter((r) => r.source !== "system")
    .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);
}

// Run incremental spike detection for a single user. Loads only the recent
// window needed, runs the exact same algorithm, deduplicates against existing
// spike events, and returns the records to create.
export async function detectSpikesForUser(
  sr: any,
  userId: string,
  windowHours = 3
): Promise<{ toCreate: any[]; detected: number }> {
  const now = Date.now();
  const windowStart = new Date(now - windowHours * 60 * MINUTE_MS).toISOString();

  const [recentReadings, existingSpikes] = await Promise.all([
    sr.entities.GlucoseReading.filter(
      { user_id: userId, recorded_at: { $gte: windowStart } },
      "recorded_at",
      500
    ),
    sr.entities.GlucoseEvent.filter(
      { user_id: userId, event_type: "spike", start_time: { $gte: windowStart } },
      "-created_date",
      100
    ),
  ]);

  const readings = readingsForDetection(recentReadings);
  const assumed = generateAssumedReadings(readings, 5);
  const spikes = detectSpikes(assumed);

  const existingStarts = existingSpikes.map((e: any) => new Date(e.start_time).getTime());

  const toCreate: any[] = [];
  let detected = 0;

  for (const spike of spikes) {
    const startTime = new Date(spike.startTime).getTime();
    const alreadyExists = existingStarts.some((t: number) => Math.abs(t - startTime) < 5 * MINUTE_MS);
    detected++;
    if (!alreadyExists) {
      toCreate.push({
        user_id: userId,
        event_type: "spike",
        start_time: spike.startTime,
        end_time: spike.peakTime,
        starting_glucose: spike.startGlucose,
        peak_glucose: spike.peakGlucose,
        peak_time: spike.peakTime,
        duration_minutes: spike.durationMinutes,
        rate_of_rise: spike.rateOfRise,
        classification: "auto_detected",
        confidence: 0.8,
      });
    }
  }

  return { toCreate, detected };
}