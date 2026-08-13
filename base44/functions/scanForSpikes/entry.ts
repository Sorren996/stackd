import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Scheduled every 5 minutes. Scans the last 24 hours of glucose readings for
// each user, detecting rapid, sustained rises ("spikes") using a rate-of-climb
// approach aligned with Dexcom G7's "Rising Fast" threshold (2 mg/dL/min).
// Brief plateaus are tolerated so a continuous rise with a momentary pause
// is treated as a single event. No time-window or duration-bound detection.
// Persists any new spikes as GlucoseEvent records (with user_id set) so the
// ActivityGraph can surface interactive markers the user can reflect on.

const MINUTE_MS = 60 * 1000;

const DETECTION = {
  minRiseMgDl: 40,         // total rise needed to qualify as a spike
  minRatePerMin: 2,        // Dexcom G7 "Rising Fast" threshold (mg/dL/min)
  sustainRatePerMin: 1,    // rate above which the spike is still "rising"
  maxPlateauReadings: 2,   // brief plateaus allowed before a spike ends
  declineBreakMgDl: 5,     // a drop of this much ends the spike immediately
  maxGapMinutes: 15,       // gaps larger than this break a spike run
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

// Rate-of-climb detector — flags steep, sustained climbs using Dexcom G7's
// "Rising Fast" threshold (2 mg/dL/min). Brief plateaus are tolerated so a
// continuous rise doesn't fragment into multiple spikes.
function detectRateSpikes(readings) {
  if (readings.length < 3) return [];

  const maxGapMs = DETECTION.maxGapMinutes * MINUTE_MS;
  const spikes = [];
  let i = 0;

  while (i < readings.length - 1) {
    const gap = readings[i + 1].time - readings[i].time;
    if (gap <= 0 || gap > maxGapMs) { i++; continue; }

    const rate = (readings[i + 1].value - readings[i].value) / (gap / MINUTE_MS);
    if (rate < DETECTION.minRatePerMin) { i++; continue; }

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
      if (readings[j + 1].value < readings[j].value - DETECTION.declineBreakMgDl) break;

      // Allow brief plateaus before ending the spike
      if (nextRate < DETECTION.sustainRatePerMin) {
        plateauCount++;
        if (plateauCount > DETECTION.maxPlateauReadings) break;
      } else {
        plateauCount = 0;
      }

      j++;
    }

    const riseAmount = peakGlucose - startGlucose;
    const durationMinutes = (peakTime - startTime) / MINUTE_MS;

    if (riseAmount >= DETECTION.minRiseMgDl) {
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

function detectSpikes(readings) {
  return deduplicateSpikes(detectRateSpikes(readings));
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