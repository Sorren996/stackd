import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { canCreateInsight } from '../../shared/insightGating.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body: any = {};
    try { body = await req.json(); } catch { /* scheduler may send empty body */ }
    const { reviewType = 'daily' } = body;

    // Use service role — this function runs on a schedule with no user context.
    // It only creates non-clinical insights; it never returns user data.
    const sr = base44.asServiceRole;

    // List all UserSettings. Filter in code because coach_reviews_enabled
    // may not exist on records created before the field was added.
    const allSettings = await sr.entities.UserSettings.list('-created_date', 50);

    let processed = 0;
    let insightsCreated = 0;
    let skipped = 0;
    const errors: any[] = [];

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const reviewDays = reviewType === 'daily' ? 1 : 7;
    const cooldownMs = reviewType === 'daily' ? 20 * 60 * 60 * 1000 : 6 * dayMs;
    const expiryDays = reviewType === 'daily' ? 3 : 7;

    for (const settings of allSettings) {
      const userId = settings.created_by_id;
      if (!userId) { skipped++; continue; }

      // Respect user preference — default to enabled if field is missing
      if (settings.coach_reviews_enabled === false) { skipped++; continue; }

      // Respect health data consent — if withdrawn, skip this user entirely.
      // This is the critical check: withdrawing consent must actually stop
      // background reviews from reading the user's data.
      try {
        const userRecords = await sr.entities.User.filter({ id: userId }, '-created_date', 1);
        const userRecord = userRecords[0];
        if (!userRecord || userRecord.health_data_consent_active === false) {
          skipped++;
          continue;
        }
      } catch (consentError) {
        console.log(`[CoachReview] Could not verify consent for user ${userId}:`, consentError.message);
        skipped++;
        continue;
      }

      // Check cooldown — idempotency guard
      const lastReview = settings.coach_last_review_at;
      if (lastReview && now.getTime() - new Date(lastReview).getTime() < cooldownMs) {
        skipped++;
        continue;
      }

      try {
        const rangeStart = new Date(now.getTime() - reviewDays * dayMs);
        const startISO = rangeStart.toISOString();
        const endISO = now.toISOString();

        // Query user's data via service role, filtered by created_by_id
        const [glucose, carbs, insulin, journals] = await Promise.all([
          sr.entities.GlucoseReading.filter(
            { recorded_at: { $gte: startISO, $lte: endISO }, created_by_id: userId },
            '-recorded_at', 500
          ),
          sr.entities.CarbEntry.filter(
            { consumed_at: { $gte: startISO, $lte: endISO }, created_by_id: userId },
            '-consumed_at', 500
          ),
          sr.entities.InsulinDose.filter(
            { administered_at: { $gte: startISO, $lte: endISO }, created_by_id: userId },
            '-administered_at', 500
          ),
          settings.coach_exclude_journal
            ? []
            : sr.entities.JournalEntry.filter(
                { entry_date: { $gte: startISO, $lte: endISO }, created_by_id: userId },
                '-entry_date', 100
              ),
        ]);

        // Require enough data to produce a grounded observation
        const totalRecords = glucose.length + carbs.length + insulin.length + journals.length;
        if (totalRecords < 3) {
          await sr.entities.UserSettings.update(settings.id, {
            coach_last_review_at: now.toISOString(),
          });
          processed++;
          continue;
        }

        // Prepare normalized data for LLM
        const llmData = {
          reviewType,
          rangeDays: reviewDays,
          glucose: glucose.map((g: any) => ({
            id: g.id, value: g.value, time: g.recorded_at, notes: g.notes || null,
          })),
          carbs: carbs.map((c: any) => ({
            id: c.id, name: c.food_name, carbs: c.carbs, time: c.consumed_at,
            is_high_protein_fat: c.is_high_protein_fat_meal || false,
            absorption: c.absorption_profile || null, notes: c.notes || null,
          })),
          insulin: insulin.map((i: any) => ({
            id: i.id, type: i.insulin_type, units: i.units, time: i.administered_at,
            notes: i.notes || null,
          })),
          journals: journals.map((j: any) => ({
            id: j.id, mood: j.mood || null, time: j.entry_date,
            content: j.content ? j.content.substring(0, 200) : null,
          })),
        };

        const analysisPrompt = buildAnalysisPrompt(llmData, reviewType);

        const analysis: any = await sr.integrations.Core.InvokeLLM({
          prompt: analysisPrompt,
          response_json_schema: {
            type: 'object',
            properties: {
              hasObservation: { type: 'boolean' },
              insightType: {
                type: 'string',
                enum: [
                  'meal_pattern', 'time_of_day_pattern', 'glucose_rhythm',
                  'journal_reflection', 'logging_pattern', 'positive_consistency',
                  'weekly_reflection',
                ],
              },
              title: { type: 'string' },
              summary: { type: 'string' },
              timeOfDayGrouping: { type: 'string' },
              mealGrouping: { type: 'string' },
              supportingGlucoseLogIds: { type: 'array', items: { type: 'string' } },
              supportingCarbLogIds: { type: 'array', items: { type: 'string' } },
              supportingInsulinLogIds: { type: 'array', items: { type: 'string' } },
              supportingJournalEntryIds: { type: 'array', items: { type: 'string' } },
            },
            required: ['hasObservation'],
          },
        });

        if (analysis && analysis.hasObservation && analysis.title && analysis.summary) {
          // Selective gating: respect the daily cap and minimum spacing so
          // insights stay rare and well-spaced rather than piling up.
          const allowed = await canCreateInsight(sr, userId, now);
          if (allowed) {
            const grouping = analysis.timeOfDayGrouping || analysis.mealGrouping || 'general';
            const deduplicationKey = `${userId}:${analysis.insightType}:${grouping}:${reviewType}`;

            // Idempotency: check for existing insight with same deduplication key
            const existing = await sr.entities.CoachInsight.filter({
              deduplication_key: deduplicationKey,
              created_by_id: userId,
            });

            if (existing.length === 0) {
              const expiresAt = new Date(now.getTime() + expiryDays * dayMs);
              await sr.entities.CoachInsight.create({
                created_by_id: userId,
                user_id: userId,
                insight_type: analysis.insightType,
                title: analysis.title,
                summary: analysis.summary,
                observation_start_at: startISO,
                observation_end_at: endISO,
                supporting_glucose_log_ids: analysis.supportingGlucoseLogIds || [],
                supporting_carb_log_ids: analysis.supportingCarbLogIds || [],
                supporting_insulin_log_ids: analysis.supportingInsulinLogIds || [],
                supporting_journal_entry_ids: analysis.supportingJournalEntryIds || [],
                status: 'unread',
                deduplication_key: deduplicationKey,
                generated_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
                model_version: 'automatic',
                analysis_version: '1.0',
                review_type: reviewType,
              });
              insightsCreated++;
            }
          }
        }

        // Always update last review time — idempotency marker
        await sr.entities.UserSettings.update(settings.id, {
          coach_last_review_at: now.toISOString(),
        });
        processed++;
      } catch (userError) {
        errors.push({ userId, error: userError.message });
      }
    }

    console.log(`[CoachReview] type=${reviewType} processed=${processed} created=${insightsCreated} skipped=${skipped} errors=${errors.length}`);

    return Response.json({
      reviewType,
      processed,
      insightsCreated,
      skipped,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[CoachReview] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildAnalysisPrompt(data: any, reviewType: string): string {
  return `You are reviewing wellness logs for a ${reviewType} check-in. Your job is to identify ONE genuinely meaningful, non-clinical pattern worth sharing with the user — or determine that nothing noteworthy is present.

## STRICT BOUNDARIES — NEVER VIOLATE
- You MUST NOT provide dosing advice, medication recommendations, or clinical assessments.
- You MUST NOT say a dose was too high, too low, an overdose, or an underdose.
- You MUST NOT recommend split dosing, basal changes, ratio changes, or ISF changes.
- You MUST NOT diagnose or label patterns with clinical terms (insulin resistance, dawn phenomenon, hypoglycemia, poor control, uncontrolled, gastroparesis, etc.).
- You MUST NOT claim causation from timing alone.
- You MUST NOT infer mood, stress, sleep, exercise, or illness unless the user logged it.
- You MUST NOT use absolute language (always, never, definitely, proves, means that).
- Only describe what you actually see in the data using calm, warm, natural language.

## MEANINGFULNESS — ONLY SURFACE WHAT TEACHES SOMETHING
- Do NOT surface an observation that merely restates data. "Your glucose stayed steady from 2pm to 4pm", "you logged 3 meals today", or "your numbers were in range this morning" are NOT insights — they are restatements. Reject them.
- Only surface an observation if it reveals a connection, a recurring tendency, or a meaningful contrast the user can genuinely learn from — for example: a specific meal that has shown a similar response more than once, a time of day that tends to unfold differently from the rest, a journal mood that lines up with glucose rhythms, or a habit worth noticing.
- It is far better to set hasObservation=false and share nothing than to share something obvious. Selectivity is the whole point — the user should feel each note carries real meaning.

## EVIDENCE REQUIREMENTS
- Require at least 3 supporting events before calling something a recurring pattern.
- For fewer events, use cautious language like "a few recent entries appear to share..."
- Use the actual meal names and times from the data.
- Use the actual record IDs for supporting log arrays.

## DATA
${JSON.stringify(data, null, 2)}

## INSTRUCTIONS
1. Look for patterns in: meal timing, glucose changes after meals, time-of-day tendencies, journal themes, positive consistency, or logging patterns.
2. If you find a worthwhile pattern with enough supporting evidence AND genuine meaning, set hasObservation=true. Provide a concise title, a 1-2 sentence conversational summary, and the supporting record IDs.
3. If the only thing you can say restates the data, or there isn't enough evidence, set hasObservation=false with empty fields.
4. The summary should sound like a caring friend noticing something genuinely interesting — not a clinical report, and not a status update.

Respond with the JSON schema.`;
}