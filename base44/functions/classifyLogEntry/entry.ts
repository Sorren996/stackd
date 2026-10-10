// Deterministic classification of carb and insulin logs.
// Triggered by entity automations when a CarbEntry or InsulinDose is created.
// Uses structured context (carb amount, glucose level, timing, nearby logs)
// to classify entries without any external API calls. Ambiguous cases get
// a sensible deterministic default. No user health data ever leaves the
// user's own records. Writes the classification back onto the record so the
// Meal Balance card can use it instead of relying solely on time-based
// heuristics.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { classifyCarbDeterministic, classifyInsulinDeterministic, isQuickSugar } from '../../shared/logClassification.ts';
import { getCarbSpeedClass, getCarbDualWave } from '../../shared/carbAbsorptionProfile.ts';

const MINUTE_MS = 60 * 1000;

const VALID_CARB_CLASSES = ['meal', 'snack', 'rescue_carbs'];
const VALID_INSULIN_CLASSES = ['meal', 'correction', 'rescue_insulin'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    let payload: any = {};
    try { payload = await req.json(); } catch { /* entity automation always sends JSON */ }

    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
    const isAdmin = user.role === 'admin';

    const event = payload.event || {};
    const data = payload.data || {};

    const entityName = event.entity_name;
    const entityId = event.entity_id;
    if (!entityName || !entityId) return Response.json({ ok: false, reason: 'missing event' });

    const isCarb = entityName === 'CarbEntry';
    const isInsulin = entityName === 'InsulinDose';
    if (!isCarb && !isInsulin) return Response.json({ ok: false, reason: 'unsupported entity' });

    // Verify the target record exists and belongs to the claimed user before
    // any service-role writes or LLM calls. Blocks unauthenticated callers
    // from tampering with other users' logs or exhausting LLM credits.
    let record: any;
    try {
      record = isCarb
        ? await sr.entities.CarbEntry.get(entityId)
        : await sr.entities.InsulinDose.get(entityId);
    } catch {
      return Response.json({ ok: false, reason: 'ownership mismatch' }, { status: 403 });
    }
    const recordOwner = record.user_id || record.created_by_id;
    if (!recordOwner || (!isAdmin && recordOwner !== user.id)) {
      return Response.json({ ok: false, reason: 'ownership mismatch' }, { status: 403 });
    }
    const userId = recordOwner;

    const logTimeStr = isCarb ? record.consumed_at : record.administered_at;
    const logTime = new Date(logTimeStr).getTime();
    if (!Number.isFinite(logTime)) return Response.json({ ok: false, reason: 'invalid time' });

    // Gather context for the LLM: recent glucose, nearby carb entries, nearby insulin doses.
    const [glucoseReadings, allCarbs, allDoses] = await Promise.all([
      sr.entities.GlucoseReading.filter({ user_id: userId }, '-recorded_at', 20),
      sr.entities.CarbEntry.list('-consumed_at', 50),
      sr.entities.InsulinDose.list('-administered_at', 50),
    ]);

    const userCarbs = allCarbs.filter((c: any) => c.created_by_id === userId);
    const userDoses = allDoses.filter((d: any) => d.created_by_id === userId);

    const relTime = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isFinite(t) ? Math.round((t - logTime) / MINUTE_MS) : null;
    };

    const glucoseContext = glucoseReadings
      .slice(0, 12)
      .map((r: any) => ({
        value: r.value,
        minutes_from_log: relTime(r.recorded_at),
      }))
      .filter((r: any) => r.minutes_from_log !== null);

    const carbContext = userCarbs
      .filter((c: any) => c.id !== entityId)
      .slice(0, 8)
      .map((c: any) => ({
        food_name: c.food_name,
        carbs: c.carbs,
        minutes_from_log: relTime(c.consumed_at),
      }))
      .filter((c: any) => c.minutes_from_log !== null);

    const doseContext = userDoses
      .filter((d: any) => d.id !== entityId)
      .slice(0, 8)
      .map((d: any) => ({
        insulin_type: d.insulin_type,
        units: d.units,
        minutes_from_log: relTime(d.administered_at),
      }))
      .filter((d: any) => d.minutes_from_log !== null);

    const logEntry = isCarb
      ? { type: 'food', food_name: data.food_name, carbs: data.carbs }
      : { type: 'insulin', insulin_type: data.insulin_type, units: data.units };

    const classes = isCarb ? VALID_CARB_CLASSES : VALID_INSULIN_CLASSES;

    // ── Deterministic-first classification ──────────────────────────
    // Try to classify without AI using structured context. Only fall back
    // to InvokeLLM when the case is genuinely ambiguous.
    const detContext = {
      logTime,
      carbs: isCarb ? Number(data.carbs) || 0 : undefined,
      insulinType: isInsulin ? data.insulin_type : undefined,
      units: isInsulin ? Number(data.units) || 0 : undefined,
      foodName: isCarb ? data.food_name : undefined,
      glucoseReadings: glucoseReadings.map((r: any) => ({ value: r.value, recorded_at: r.recorded_at })),
      nearbyCarbs: userCarbs.filter((c: any) => c.id !== entityId).slice(0, 8).map((c: any) => ({ id: c.id, food_name: c.food_name, carbs: c.carbs, consumed_at: c.consumed_at })),
      nearbyDoses: userDoses.filter((d: any) => d.id !== entityId).slice(0, 8).map((d: any) => ({ id: d.id, insulin_type: d.insulin_type, units: d.units, administered_at: d.administered_at })),
    };

    const deterministic = isCarb
      ? classifyCarbDeterministic(detContext)
      : classifyInsulinDeterministic(detContext);

    if (deterministic) {
      if (isCarb) {
        const carbPatch = isCarb
          ? { classification: deterministic.classification, classification_reasoning: deterministic.reasoning, speed_class: getCarbSpeedClass(record), dual_wave: getCarbDualWave(record) }
          : {};
        await sr.entities.CarbEntry.update(entityId, carbPatch);
      } else {
        await sr.entities.InsulinDose.update(entityId, { classification: deterministic.classification, classification_reasoning: deterministic.reasoning });
      }
      return Response.json({ ok: true, entityName, entityId, classification: deterministic.classification, source: 'deterministic' });
    }

    // ── Deterministic fallback for ambiguous cases ──────────────
    // No external API calls — user health data never leaves their records.
    // Apply sensible defaults based on the structured context available.
    let classification: string;
    let reasoning: string;

    if (isCarb) {
      // Ambiguous carb: default by amount and quick-sugar status
      if (carbs >= 20) {
        classification = 'meal';
        reasoning = 'A nourishing occasion to note on your wellness journey.';
      } else if (isQuickSugar(data.food_name)) {
        classification = 'snack';
        reasoning = 'A small sweet moment, logged with care.';
      } else {
        classification = 'snack';
        reasoning = 'A lighter bite between meals, a small moment of nourishment.';
      }
    } else {
      // Ambiguous insulin: default by glucose level
      if (glucoseContext.length > 0) {
        const latest = glucoseContext[0];
        if (latest.value > 250) {
          classification = 'rescue_insulin';
          reasoning = 'An unplanned dose when glucose was well above your comfortable range, a gentle nudge back toward balance.';
        } else if (latest.value > 180) {
          classification = 'correction';
          reasoning = 'A gentle correction to guide glucose back toward your comfortable range.';
        } else {
          classification = 'correction';
          reasoning = 'A supportive dose to help guide your glucose journey.';
        }
      } else {
        classification = 'correction';
        reasoning = 'A supportive dose to help guide your glucose journey.';
      }
    }

    if (isCarb) {
      await sr.entities.CarbEntry.update(entityId, {
        classification,
        classification_reasoning: reasoning,
        speed_class: getCarbSpeedClass(record),
        dual_wave: getCarbDualWave(record),
      });
    } else {
      await sr.entities.InsulinDose.update(entityId, { classification, classification_reasoning: reasoning });
    }

    return Response.json({ ok: true, entityName, entityId, classification, source: 'deterministic_fallback' });
  } catch (error) {
    console.error('[classifyLogEntry] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}