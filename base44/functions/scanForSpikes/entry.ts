import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Force-scans the last 24 hours of glucose readings for rapid, sustained
// rises ("spikes") and persists any that aren't already tracked as
// GlucoseEvent records. This gives the ActivityGraph and the AI Coach a
// stable set of spike events to reference, and lets the user reflect on
// them via the spike-tagging modal. Triggered manually from the graph.

const MINUTE_MS = 60 * 1000;

const DETECTION = {
  minRiseMgDl: 40,
  minRatePerMin: 2,
  sustainRatePerMin: 0.5,
  minDurationMinutes: 10,
  maxDurationMinutes: 60,
  maxGapMinutes: 15,
};

function generateAssumedReadings(readings, maxGapMinutes) {
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

function detectSpikes(readings) {
  if (readings.length < 3) return [];

  const spikes = [];
  let i = 0;

  while (i < readings.length - 1) {
    const gap = readings[i + 1].time - readings[i].time;
    if (gap <= 0 || gap > DETECTION.maxGapMinutes * MINUTE_MS) { i++; continue; }

    const rate = (readings[i + 1].value - readings[i].value) / (gap / MINUTE_MS);
    if (rate < DETECTION.minRatePerMin) { i++; continue; }

    const startTime = readings[i].time;
    const startGlucose = readings[i].value;
    let peakGlucose = readings[i + 1].value;
    let peakTime = readings[i + 1].time;
    let j = i + 1;

    while (j < readings.length - 1) {
      const nextGap = readings[j + 1].time - readings[j].time;
      if (nextGap <= 0 || nextGap > DETECTION.maxGapMinutes * MINUTE_MS) break;

      const nextRate = (readings[j + 1].value - readings[j].value) / (nextGap / MINUTE_MS);

      if (readings[j + 1].value > peakGlucose) {
        peakGlucose = readings[j + 1].value;
        peakTime = readings[j + 1].time;
      }

      if (nextRate < DETECTION.sustainRatePerMin) break;
      j++;
    }

    const riseAmount = peakGlucose - startGlucose;
    const durationMinutes = (peakTime - startTime) / MINUTE_MS;

    if (
      riseAmount >= DETECTION.minRiseMgDl &&
      durationMinutes >= DETECTION.minDurationMinutes &&
      durationMinutes <= DETECTION.maxDurationMinutes
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

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const records = await base44.entities.GlucoseReading.filter(
      { recorded_at: { $gte: windowStart.toISOString() } },
      'recorded_at',
      1000
    );

    const readings = records
      .map((r) => ({
        time: new Date(r.recorded_at).getTime(),
        value: Number(r.value),
      }))
      .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
      .sort((a, b) => a.time - b.time);

    // Interpolate assumed readings between real ones when gaps exceed 5 min,
    // mirroring the client-side logic so detection is consistent.
    const assumed = generateAssumedReadings(readings, 5);
    const spikes = detectSpikes(assumed);

    // Avoid duplicating events that are already tracked
    const existing = await base44.entities.GlucoseEvent.filter(
      { event_type: 'spike', start_time: { $gte: windowStart.toISOString() } },
      '-created_date',
      100
    );
    const existingStarts = existing.map((e) => new Date(e.start_time).getTime());

    const toCreate = [];
    for (const spike of spikes) {
      const startTime = new Date(spike.startTime).getTime();
      const alreadyExists = existingStarts.some(
        (t) => Math.abs(t - startTime) < 5 * MINUTE_MS
      );
      if (!alreadyExists) {
        toCreate.push({
          event_type: 'spike',
          start_time: spike.startTime,
          end_time: spike.peakTime,
          starting_glucose: spike.startGlucose,
          peak_glucose: spike.peakGlucose,
          peak_time: spike.peakTime,
          duration_minutes: spike.durationMinutes,
          rate_of_rise: spike.rateOfRise,
          classification: 'auto_detected',
          confidence: 0.8,
        });
      }
    }

    if (toCreate.length) {
      await base44.entities.GlucoseEvent.bulkCreate(toCreate);
    }

    return Response.json({
      detected: spikes.length,
      created: toCreate.length,
      alreadyTracked: spikes.length - toCreate.length,
      spikes,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}