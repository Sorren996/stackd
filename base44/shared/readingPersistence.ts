// One reading per (user, moment).
//
// Two Dexcom paths write the same stream — Share and the official API — and the
// scheduler can run them close together. Comparing timestamps before inserting
// is not enough on its own: two writers that both read "not stored yet" will
// both insert. So every real ingestion goes through this module, which
//
//   1. treats (user_id, recorded_at) as the identity of a reading: a moment that
//      is already stored is UPDATED with the corrected value, never inserted
//      again;
//   2. reconciles the freshly written window afterwards, keeping the most
//      recently written row for each moment and removing any extra the race
//      produced.
//
// Notifications are unaffected by a correction: the claim ledger keys on the
// reading's identity (source + measured instant), never on its value, so a
// corrected number at the same moment cannot notify twice.
//
// SAFETY: only shapes storage. Never interprets a value.

import { scoreReadingWindow } from './projectionResidualScoring.ts';

function momentOf(recordedAt: unknown): number | null {
  const t = new Date(recordedAt as string).getTime();
  return Number.isFinite(t) ? t : null;
}

function writtenAt(row: any): number {
  const t = new Date(row?.updated_date || row?.created_date || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  insertedIds: string[];
  insertedTimestamps: string[];
}

/**
 * Insert the readings that are genuinely new, update the ones that already
 * exist at the same measured instant, and leave everything else alone.
 */
export async function upsertReadings({
  sr,
  ownerId,
  rows,
}: {
  sr: any;
  ownerId: string;
  rows: any[];
}): Promise<UpsertResult> {
  const batch = (Array.isArray(rows) ? rows : []).filter(
    (row) => row && momentOf(row.recorded_at) != null
  );
  const result: UpsertResult = { inserted: 0, updated: 0, insertedIds: [], insertedTimestamps: [] };
  if (!batch.length) return result;

  const moments = batch.map((row) => momentOf(row.recorded_at) as number).sort((a, b) => a - b);
  const existing = await sr.entities.GlucoseReading.filter(
    {
      user_id: ownerId,
      recorded_at: {
        $gte: new Date(moments[0] - 1000).toISOString(),
        $lte: new Date(moments[moments.length - 1] + 1000).toISOString(),
      },
    },
    '-recorded_at',
    500
  );

  const storedByMoment = new Map<number, any>();
  for (const row of Array.isArray(existing) ? existing : []) {
    const moment = momentOf(row?.recorded_at);
    if (moment == null) continue;
    const current = storedByMoment.get(moment);
    if (!current || writtenAt(row) >= writtenAt(current)) storedByMoment.set(moment, row);
  }

  const toCreate: any[] = [];
  const toUpdate: { id: string; value: number; trend: string | null }[] = [];

  for (const row of batch) {
    const moment = momentOf(row.recorded_at) as number;
    const found = storedByMoment.get(moment);
    if (!found) {
      toCreate.push(row);
      storedByMoment.set(moment, row);
      continue;
    }
    const sameValue = Number(found.value) === Number(row.value);
    const sameTrend = (row.trend ?? null) === (found.trend ?? null);
    if (!sameValue || !sameTrend) {
      toUpdate.push({ id: found.id, value: Number(row.value), trend: row.trend ?? null });
    }
  }

  if (toCreate.length) {
    const created = await sr.entities.GlucoseReading.bulkCreate(toCreate);
    const createdRows = Array.isArray(created) ? created : [];
    result.inserted = toCreate.length;
    result.insertedIds = createdRows.map((row: any) => row?.id).filter(Boolean);
    result.insertedTimestamps = toCreate.map((row) => row.recorded_at);
  }

  if (toUpdate.length) {
    const updates = await Promise.allSettled(
      toUpdate.map((row) =>
        sr.entities.GlucoseReading.update(row.id, { value: row.value, trend: row.trend })
      )
    );
    result.updated = updates.filter((entry) => entry.status === 'fulfilled').length;
  }

  if (result.inserted || result.updated) {
    try {
      await scoreReadingWindow(sr, ownerId, moments[0], moments[moments.length - 1]);
    } catch (error) {
      // A scoring outage never blocks saved readings or notification delivery.
      // The next reading and the explicit backfill share the same idempotent scorer.
      console.error('Projection residual scoring failed', error.name);
    }
  }
  return result;
}

/**
 * Collapse any duplicates in a freshly written window, keeping the row written
 * most recently for each measured instant. Bounded to the window the caller just
 * touched, so it never walks the whole history.
 */
export async function reconcileReadings({
  sr,
  ownerId,
  sinceIso,
}: {
  sr: any;
  ownerId: string;
  sinceIso: string;
}): Promise<number> {
  const rows = await sr.entities.GlucoseReading.filter(
    { user_id: ownerId, recorded_at: { $gte: sinceIso } },
    '-recorded_at',
    500
  );
  const groups = new Map<number, any[]>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const moment = momentOf(row?.recorded_at);
    if (moment == null) continue;
    const list = groups.get(moment) || [];
    list.push(row);
    groups.set(moment, list);
  }

  const extras: string[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keep = list.reduce((best, row) => (writtenAt(row) > writtenAt(best) ? row : best), list[0]);
    for (const row of list) if (row.id !== keep.id) extras.push(row.id);
  }
  if (!extras.length) return 0;

  await Promise.allSettled(
    extras.slice(0, 50).map((id) => sr.entities.GlucoseReading.delete(id))
  );
  return extras.length;
}