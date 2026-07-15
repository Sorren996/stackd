import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled maintenance function.
// Locks every glucose, carb, and insulin log older than 14 days by setting
// is_locked = true. Once locked, RLS prevents any edit or delete on the record,
// preserving historical accuracy for averages, graphs, and AI insights.
// Runs with the service role — there is no user context on a schedule.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const dayMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - 14 * dayMs).toISOString();

    // Only lock records that are not already locked (idempotent).
    const lockQuery = (dateField: string) => ({
      [dateField]: { $lt: cutoff },
      is_locked: { $ne: true },
    });

    const [glucose, carbs, insulin] = await Promise.all([
      sr.entities.GlucoseReading.updateMany(lockQuery('recorded_at'), { $set: { is_locked: true } }),
      sr.entities.CarbEntry.updateMany(lockQuery('consumed_at'), { $set: { is_locked: true } }),
      sr.entities.InsulinDose.updateMany(lockQuery('administered_at'), { $set: { is_locked: true } }),
    ]);

    return Response.json({
      cutoff,
      glucose,
      carbs,
      insulin,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});