import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Scheduled every 5 minutes. Scans the last 24 hours of glucose readings for
// each user, detecting rapid, sustained rises ("spikes") of 40+ mg/dL lasting
// between 10 and 75 minutes. Persists any new spikes as GlucoseEvent records
// (with user_id set) so the ActivityGraph can surface interactive spike
// markers the user can reflect on.

const MINUTE_MS = 60 * 1000;

const DETECTION = {
  minRiseMgDl: 40,
  minRatePerMin: 2,
  sustainRatePerMin: 0.5,
  minDurationMinutes: 10,
  maxDurationMinutes: 75,
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

// Rate-based detector — flags steep, sustained climbs.
function detectRateSpikes(readings) {
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

  return spikes;
}

// Window-based detector — flags any rise of 40+ mg/dL whose peak falls within
// 75 minutes of the start, catching gentle, prolonged climbs the rate detector
// misses. Scans each reading as a candidate start and tracks the highest peak
// before glucose reverses or the 75-minute window closes.
function detectWindowSpikes(readings) {
  if (readings.length < 2) return [];

  const spikes = [];
  const windowMs = DETECTION.maxDurationMinutes * MINUTE_MS;

  for (let i = 0; i < readings.length - 1; i++) {
    const startTime = readings[i].time;
    const startGlucose = readings[i].value;
    const windowEnd = startTime + windowMs;

    let peakGlucose = startGlucose;
    let peakTime = startTime;

    for (let j = i + 1; j < readings.length; j++) {
      if (readings[j].time > windowEnd) break;
      const gap = readings[j].time - readings[j - 1].time;
      if (gap > DETECTION.maxGapMinutes * MINUTE_MS) break;

      if (readings[j].value > peakGlucose) {
        peakGlucose = readings[j].value;
        peakTime = readings[j].time;
      }
    }

    const riseAmount = peakGlucose - startGlucose;
    const durationMinutes = (peakTime - startTime) / MINUTE_MS;

    if (riseAmount >= DETECTION.minRiseMgDl && durationMinutes > 0) {
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
  }

  return spikes;
}

function detectSpikes(readings) {
  const rateSpikes = detectRateSpikes(readings);
  const windowSpikes = detectWindowSpikes(readings);
  return deduplicateSpikes([...rateSpikes, ...windowSpikes]);
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

function ownerOf(record) {
  return record.user_id || record.created_by_id;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Pull all glucose readings from the last 24 hours across all users.
    const records = await sr.entities.GlucoseReading.filter(
      { recorded_at: { $gte: windowStart.toISOString() } },
      'recorded_at',
      5000
    );

    // Group readings by owner.
    const byOwner = new Map();
    for (const r of records) {
      const owner = ownerOf(r);
      if (!owner) continue;
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push(r);
    }

    // Fetch existing spike events to avoid duplicates, grouped by owner.
    const existing = await sr.entities.GlucoseEvent.filter(
      { event_type: 'spike', start_time: { $gte: windowStart.toISOString() } },
      '-created_date',
      500
    );
    const existingByOwner = new Map();
    for (const e of existing) {
      const owner = ownerOf(e);
      if (!owner) continue;
      if (!existingByOwner.has(owner)) existingByOwner.set(owner, []);
      existingByOwner.get(owner).push(new Date(e.start_time).getTime());
    }

    const toCreate = [];
    let totalDetected = 0;

    for (const [owner, ownerRecords] of byOwner) {
      const readings = ownerRecords
        .map((r) => ({
          time: new Date(r.recorded_at).getTime(),
          value: Number(r.value),
        }))
        .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
        .sort((a, b) => a.time - b.time);

      const assumed = generateAssumedReadings(readings, 5);
      const spikes = detectSpikes(assumed);

      const existingStarts = existingByOwner.get(owner) || [];

      for (const spike of spikes) {
        const startTime = new Date(spike.startTime).getTime();
        const alreadyExists = existingStarts.some(
          (t) => Math.abs(t - startTime) < 5 * MINUTE_MS
        );
        totalDetected++;
        if (!alreadyExists) {
          toCreate.push({
            user_id: owner,
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
    }

    if (toCreate.length) {
      await sr.entities.GlucoseEvent.bulkCreate(toCreate);
    }

    return Response.json({
      usersScanned: byOwner.size,
      detected: totalDetected,
      created: toCreate.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}