import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { detectSpikesForUser } from '../../shared/spikeDetection.ts';

// Triggered when a user logs a new glucose reading (manual or CGM). Fills the
// gap between the previous real reading and the new one with "system"
// carry-forward readings at 5-minute intervals, giving the AI Coach a
// continuous timeline during gaps. System readings are filtered out of the
// ActivityGraph display so the graph only shows real readings.
//
// Also runs incremental spike detection for this user after filling gaps,
// replacing the scheduled scanForSpikes full-scan automation.

const STEP_MS = 5 * 60 * 1000;

function ownerOf(reading) {
  return reading.user_id || reading.created_by_id;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    // Entity event payload: { event: { type, entity_name, entity_id }, data }
    const body = await req.json().catch(() => ({}));
    let current = body?.data;
    const entityId = body?.event?.entity_id;

    // If the payload was too large, fetch the reading by ID.
    if (!current && entityId) {
      current = await sr.entities.GlucoseReading.get(entityId);
    }

    if (!current) {
      return Response.json({ skipped: true, reason: 'no_reading_data' });
    }

    // Only fill gaps for real readings, never for system carry-forwards.
    if (current.source === 'system') {
      return Response.json({ skipped: true, reason: 'system_source' });
    }

    const owner = ownerOf(current);
    if (!owner) {
      return Response.json({ skipped: true, reason: 'no_owner' });
    }

    const newTime = new Date(current.recorded_at).getTime();
    const newValue = Number(current.value);
    if (!Number.isFinite(newTime) || !Number.isFinite(newValue)) {
      return Response.json({ skipped: true, reason: 'invalid_value' });
    }

    // Find the most recent real reading before this one for the same user.
    const candidates = await sr.entities.GlucoseReading.filter(
      { recorded_at: { $lt: current.recorded_at } },
      '-recorded_at',
      50
    );

    let prevReading = null;
    for (const r of candidates) {
      if (ownerOf(r) !== owner) continue;
      if (r.source === 'system') continue;
      prevReading = r;
      break;
    }

    if (!prevReading) {
      return Response.json({ skipped: true, reason: 'no_previous_reading' });
    }

    const prevTime = new Date(prevReading.recorded_at).getTime();
    const prevValue = Number(prevReading.value);
    const gapMs = newTime - prevTime;

    // Only fill if the gap is larger than the step interval.
    if (gapMs <= STEP_MS || !Number.isFinite(prevValue)) {
      return Response.json({ skipped: true, reason: 'gap_too_small' });
    }

    const toCreate = [];
    let t = prevTime + STEP_MS;
    while (t < newTime - STEP_MS / 2) {
      const fraction = (t - prevTime) / (newTime - prevTime);
      toCreate.push({
        user_id: owner,
        value: Math.round(prevValue + (newValue - prevValue) * fraction),
        recorded_at: new Date(t).toISOString(),
        source: 'system',
        notes: 'System-generated interpolation between two real readings.',
      });
      t += STEP_MS;
    }

    if (toCreate.length) {
      await sr.entities.GlucoseReading.bulkCreate(toCreate);
    }

    // Incremental spike detection for this user — replaces the scheduled
    // scanForSpikes full-scan. Only processes this user's recent window.
    let spikesCreated = 0;
    try {
      const { toCreate: spikeRecords } = await detectSpikesForUser(sr, owner, 3);
      if (spikeRecords.length) {
        await sr.entities.GlucoseEvent.bulkCreate(spikeRecords);
        spikesCreated = spikeRecords.length;
      }
    } catch {
      // Spike detection failure is non-fatal — gap filling already succeeded
    }

    return Response.json({
      generated: toCreate.length,
      spikesCreated,
      owner,
      from: prevReading.recorded_at,
      to: current.recorded_at,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}