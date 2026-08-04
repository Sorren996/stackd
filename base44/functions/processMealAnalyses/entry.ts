import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { computeMealResponse, DEFAULT_SETTINGS } from '../../shared/mealResponseAnalysis.ts';

// Scheduled Meal Memory analysis pipeline (no user context — service role).
// Scans CarbEntry records that are at least 4 hours old and either have no
// completed MealResponseAnalysis or have one that is stale relative to newer
// related logs, then (re)computes and persists the retrospective analysis.
// Bounded per run so a single invocation stays within the time budget.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const WINDOW_HOURS = 4;
const RERUN_LOOKBACK_DAYS = 7;
const MAX_PER_RUN = 25;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const now = Date.now();
    const cutoff = new Date(now - WINDOW_HOURS * HOUR_MS).toISOString();
    const lookbackCutoff = new Date(now - RERUN_LOOKBACK_DAYS * 24 * HOUR_MS).toISOString();

    // Meals younger than 4h aren't ready. Older meals within the lookback window
    // are candidates for first-time analysis or re-run.
    const candidateMeals = await sr.entities.CarbEntry.filter({
      consumed_at: { $lte: cutoff, $gte: lookbackCutoff },
      is_locked: { $ne: true },
    }, '-consumed_at', 200);

    if (!candidateMeals || !candidateMeals.length) {
      return Response.json({ processed: 0, reason: 'no_candidates' });
    }

    // Find which meals already have an analysis.
    const mealIds = candidateMeals.map((m) => m.id);
    const existing = await sr.entities.MealResponseAnalysis.filter({
      meal_log_id: { $in: mealIds },
    }, '-updated_date', 400);

    const byMealId: Record<string, any> = {};
    for (const a of existing) {
      byMealId[a.meal_log_id] = a;
    }

    // Group users so we can fetch their logs once per user.
    const byUser: Record<string, any[]> = {};
    const toProcess: { meal: any; existing: any | null }[] = [];

    for (const meal of candidateMeals) {
      const analysis = byMealId[meal.id];
      const userId = meal.created_by_id;
      if (!userId) continue;

      if (analysis && analysis.analysis_status === 'complete' && !analysis.needs_rerun) {
        // Re-run if a related log was edited after the analysis was saved.
        const analysisUpdated = analysis.updated_date ? new Date(analysis.updated_date).getTime() : 0;
        const analysisWindowEnd = analysis.analysis_window_end ? new Date(analysis.analysis_window_end).getTime() : 0;
        // Only consider re-running analyses whose window ended within the lookback
        if (analysisWindowEnd < now - RERUN_LOOKBACK_DAYS * 24 * HOUR_MS) continue;
        // Stale check is resolved per-user below once logs are loaded.
        (byUser[userId] = byUser[userId] || []).push(meal);
        toProcess.push({ meal, existing: analysis });
        continue;
      }

      (byUser[userId] = byUser[userId] || []).push(meal);
      toProcess.push({ meal, existing: analysis || null });
    }

    let processed = 0;
    let saved = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const { meal, existing } of toProcess) {
      if (processed >= MAX_PER_RUN) break;
      const userId = meal.created_by_id;

      try {
        const mealTime = new Date(meal.consumed_at).getTime();
        if (!Number.isFinite(mealTime)) { skipped++; continue; }

        const windowEnd = mealTime + (meal.is_high_protein_fat_meal ? 6 : 4) * HOUR_MS;
        const fetchStart = new Date(mealTime - 2 * HOUR_MS).toISOString();
        const fetchEnd = new Date(windowEnd + 2 * HOUR_MS).toISOString();

        // Fetch this user's logs around the window once.
        const [glucose, doses, carbs, settingsList] = await Promise.all([
          sr.entities.GlucoseReading.filter({
            created_by_id: userId,
            recorded_at: { $gte: fetchStart, $lte: fetchEnd },
          }, '-recorded_at', 500),
          sr.entities.InsulinDose.filter({
            created_by_id: userId,
            administered_at: { $gte: fetchStart, $lte: fetchEnd },
          }, '-administered_at', 200),
          sr.entities.CarbEntry.filter({
            created_by_id: userId,
            consumed_at: { $gte: fetchStart, $lte: fetchEnd },
          }, '-consumed_at', 200),
          sr.entities.UserSettings.filter({ created_by_id: userId }, '-updated_date', 1),
        ]);

        // Stale check: skip if the existing complete analysis is newer than all
        // related logs that fall within the response window.
        if (existing && existing.analysis_status === 'complete' && !existing.needs_rerun) {
          const analysisUpdated = existing.updated_date ? new Date(existing.updated_date).getTime() : 0;
          const newestRelated = Math.max(
            ...glucose.map((g) => g.updated_date ? new Date(g.updated_date).getTime() : 0),
            ...doses.map((d) => d.updated_date ? new Date(d.updated_date).getTime() : 0),
            ...carbs.map((c) => c.updated_date ? new Date(c.updated_date).getTime() : 0),
            0,
          );
          if (newestRelated <= analysisUpdated) { skipped++; continue; }
        }

        const settings = settingsList?.[0] || null;
        const analysisSettings = {
          targetLow: Number(settings?.target_range_low) || DEFAULT_SETTINGS.targetLow,
          targetHigh: Number(settings?.target_range_high) || DEFAULT_SETTINGS.targetHigh,
          preMealWindowMinutes: Number(settings?.meal_prebolus_window_minutes) || DEFAULT_SETTINGS.preMealWindowMinutes,
          postMealWindowMinutes: Number(settings?.meal_postbolus_window_minutes) || DEFAULT_SETTINGS.postMealWindowMinutes,
        };

        const result = computeMealResponse(meal, glucose, doses, carbs, analysisSettings);
        if (!result) { skipped++; continue; }

        const status = (result.confounding_events || []).includes('missing_glucose_data')
          ? 'incomplete'
          : 'complete';

        const payload = {
          ...result,
          user_id: userId,
          analysis_status: status,
          needs_rerun: status === 'incomplete',
        };

        if (existing && existing.id) {
          await sr.entities.MealResponseAnalysis.update(existing.id, payload);
        } else {
          await sr.entities.MealResponseAnalysis.create(payload);
        }
        saved++;
      } catch (err) {
        errors.push(`${meal.id}: ${err.message}`);
      }
      processed++;
    }

    return Response.json({
      candidates: candidateMeals.length,
      processed,
      saved,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});