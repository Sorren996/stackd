// AI-powered classification of carb and insulin logs.
// Triggered by entity automations when a CarbEntry or InsulinDose is created.
// Uses InvokeLLM to classify the log as meal / snack / rescue_carbs (for food)
// or meal / correction / rescue_insulin (for insulin), based on the food name,
// carb amount, timing, nearby glucose trend, and surrounding logs.
// Writes the classification back onto the record so the Meal Balance card can
// use it instead of relying solely on time-based heuristics.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MINUTE_MS = 60 * 1000;

const VALID_CARB_CLASSES = ['meal', 'snack', 'rescue_carbs'];
const VALID_INSULIN_CLASSES = ['meal', 'correction', 'rescue_insulin'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    let payload: any = {};
    try { payload = await req.json(); } catch { /* entity automation always sends JSON */ }

    const event = payload.event || {};
    const data = payload.data || {};
    const userId: string | undefined = data.created_by_id || data.user_id;
    if (!userId) return Response.json({ ok: false, reason: 'no user_id' });

    const entityName = event.entity_name;
    const entityId = event.entity_id;
    if (!entityName || !entityId) return Response.json({ ok: false, reason: 'missing event' });

    const isCarb = entityName === 'CarbEntry';
    const isInsulin = entityName === 'InsulinDose';
    if (!isCarb && !isInsulin) return Response.json({ ok: false, reason: 'unsupported entity' });

    const logTimeStr = isCarb ? data.consumed_at : data.administered_at;
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
      ? { type: 'food', food_name: data.food_name, carbs: data.carbs, is_high_protein_fat_meal: data.is_high_protein_fat_meal }
      : { type: 'insulin', insulin_type: data.insulin_type, units: data.units };

    const classes = isCarb ? VALID_CARB_CLASSES : VALID_INSULIN_CLASSES;

    const prompt = `You are a warm, uplifting wellness companion for a glucose monitoring app. Your role is to classify a user's log entry so the app can understand their nourishment and support rhythm in a supportive, non-judgmental way.

Classify this ${isCarb ? 'food entry' : 'insulin dose'} into exactly one of these categories:
${isCarb
  ? '- "meal": A substantial eating occasion — breakfast, lunch, dinner, or a large combo of real foods (e.g. "wings and popcorn", "spaghetti", "chicken sandwich and fries"). Typically 30g+ carbs with real food.\n- "snack": A lighter bite between meals (e.g. a small treat, fruit, handful of something). Typically under 30g carbs.\n- "rescue_carbs": Quick-sugar carbs taken to lift a dipping glucose trend — gummies, juice, glucose tablets — when glucose is trending down or already low. Always small amounts (typically ≤15g).'
  : '- "meal": Insulin timed to support a food occasion.\n- "correction": Insulin given to gently bring glucose back toward a comfortable range, not tied to food.\n- "rescue_insulin": An urgent or unplanned dose when glucose is unexpectedly well above the comfortable range.'}

Context — recent glucose readings (mg/dL, minutes from this log; negative = before, positive = after):
${JSON.stringify(glucoseContext)}

Recent food entries nearby (minutes from this log):
${JSON.stringify(carbContext)}

Recent insulin doses nearby (minutes from this log):
${JSON.stringify(doseContext)}

The entry to classify:
${JSON.stringify(logEntry)}

Guidance:
- For food: if glucose was trending down or near/below ~70 mg/dL when the food was logged, and it is quick-sugar (gummies, juice, candy), lean toward "rescue_carbs". IMPORTANT: rescue_carbs is always small (typically ≤15g). A large carb amount (25g+) is a meal or snack, never rescue_carbs — even if insulin was dosed first and glucose is trending down. If it is a real food combo or a substantial amount, lean toward "meal". Small treats between meals are "snack".
- For insulin: if a food entry was logged within ~90 minutes, lean toward "meal". If glucose was high with no nearby food, lean toward "correction" or "rescue_insulin" (use "rescue_insulin" for more urgent/very-high situations).

Respond as JSON with:
- "classification": one of ${JSON.stringify(classes)}
- "reasoning": one supportive, wellness-focused sentence explaining why (non-medical, encouraging tone)`;

    const result = await sr.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          classification: { type: 'string' },
          reasoning: { type: 'string' },
        },
      },
    });

    let classification: string = result.classification;
    if (!classes.includes(classification)) {
      classification = isCarb ? 'snack' : 'correction';
    }
    const reasoning: string = (result.reasoning || '').slice(0, 500);

    if (isCarb) {
      await sr.entities.CarbEntry.update(entityId, { classification, classification_reasoning: reasoning });
    } else {
      await sr.entities.InsulinDose.update(entityId, { classification, classification_reasoning: reasoning });
    }

    return Response.json({ ok: true, entityName, entityId, classification });
  } catch (error) {
    console.error('[classifyLogEntry] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}