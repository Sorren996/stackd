import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Scheduled every 5 minutes. For every user with glucose history, if their
// most recent reading is older than the current 5-minute window, a "system"
// reading is created that carries forward the last known value. This gives
// the AI Coach a continuous picture of where glucose has been sitting during
// sensor gaps, so reviews are grounded in a full timeline rather than sparse
// snapshots. System readings are tagged source: "system" so the Coach can
// distinguish carried-forward state from fresh measurements.

const BUCKET_MS = 5 * 60 * 1000;
const LOOKBACK_MS = 6 * 60 * 60 * 1000;

function bucketFloor(date) {
  return Math.floor(date.getTime() / BUCKET_MS) * BUCKET_MS;
}

function ownerOf(reading) {
  return reading.user_id || reading.created_by_id;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const now = new Date();
    const currentBucket = bucketFloor(now);
    const lookbackStart = new Date(now.getTime() - LOOKBACK_MS);

    // Pull recent readings to identify active users and their latest values.
    const recent = await sr.entities.GlucoseReading.filter(
      { recorded_at: { $gte: lookbackStart.toISOString() } },
      '-recorded_at',
      1000
    );

    // Group by owner, keeping only the most recent reading per user.
    const latestByOwner = new Map();
    for (const r of recent) {
      const owner = ownerOf(r);
      if (!owner) continue;
      if (!latestByOwner.has(owner)) {
        latestByOwner.set(owner, r);
      }
    }

    const toCreate = [];
    const summary = [];

    for (const [owner, latest] of latestByOwner) {
      const latestTime = new Date(latest.recorded_at).getTime();

      // If the latest reading already falls within the current 5-min window
      // (including a previous system carry-forward), nothing to fill.
      if (latestTime >= currentBucket) {
        summary.push({ owner, status: 'current' });
        continue;
      }

      const value = Number(latest.value);
      if (!Number.isFinite(value)) {
        summary.push({ owner, status: 'invalid_value' });
        continue;
      }

      toCreate.push({
        user_id: owner,
        value,
        recorded_at: new Date(currentBucket).toISOString(),
        source: 'system',
        notes: 'System-generated carry-forward of last known glucose value during a sensor gap.',
      });
      summary.push({ owner, status: 'filled', carriedFrom: latest.recorded_at, value });
    }

    if (toCreate.length) {
      await sr.entities.GlucoseReading.bulkCreate(toCreate);
    }

    return Response.json({
      processed: latestByOwner.size,
      generated: toCreate.length,
      bucket: new Date(currentBucket).toISOString(),
      summary,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}