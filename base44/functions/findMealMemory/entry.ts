import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { buildMealFingerprint, scoreMealSimilarity, matchTier } from '../../shared/mealFingerprint.ts';

// Log-time Meal Memory matcher.
// Given a meal the user is about to log, searches completed MealResponseAnalysis
// records for comparable past meals and returns the best comparison plus an
// aggregate pattern when enough strong matches exist. Never prescribes a dose —
// the frontend composes the conversational summary from the returned analysis.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mealName = String(body.mealName || '').trim();
    const carbs = Number(body.carbs) || 0;
    const highProteinFat = Boolean(body.highProteinFat);
    const currentMealTime = body.mealTime ? new Date(body.mealTime).getTime() : Date.now();

    if (!mealName || carbs <= 0) {
      return Response.json({ found: false, reason: 'incomplete_input' });
    }

    const currentFingerprint = buildMealFingerprint(mealName, carbs, highProteinFat);

    const [analyses, feedback] = await Promise.all([
      base44.entities.MealResponseAnalysis.filter({ analysis_status: 'complete' }, '-meal_time', 200),
      base44.entities.MealMatchFeedback.list('-created_date', 200),
    ]);

    // Build a penalty set of historical normalized names the user rejected for
    // meals resembling the current one. Keyed by historical normalized name.
    const rejectedNames = new Set<string>();
    for (const fb of feedback) {
      if (fb.feedback_type !== 'not_same_meal') continue;
      const histName = fb.historical_meal_name || (fb.historical_meal_fingerprint && fb.historical_meal_fingerprint.normalized_name);
      if (histName) rejectedNames.add(histName);
    }

    const scored = (analyses || [])
      .map((analysis) => {
        const historicalFp = analysis.meal_fingerprint || buildMealFingerprint(analysis.meal_name_original, analysis.carbs_logged, analysis.high_protein_fat);
        const historicalMealTime = analysis.meal_time ? new Date(analysis.meal_time).getTime() : null;
        const similarity = scoreMealSimilarity(currentFingerprint, historicalFp, {
          currentMealTime,
          historicalMealTime,
        });
        let penalty = 0;
        if (rejectedNames.has(historicalFp.normalized_name)) penalty = 20;
        const adjustedScore = Math.max(0, similarity.score - penalty);
        return { analysis, similarity: { ...similarity, score: adjustedScore, penalty }, tier: matchTier(adjustedScore) };
      })
      .filter((m) => m.similarity.score >= 50)
      .sort((a, b) => {
        // Prefer stronger match; break ties with completeness + recency.
        if (b.similarity.score !== a.similarity.score) return b.similarity.score - a.similarity.score;
        const aConf = a.analysis.confidence_score || 0;
        const bConf = b.analysis.confidence_score || 0;
        if (bConf !== aConf) return bConf - aConf;
        const aTime = a.analysis.meal_time ? new Date(a.analysis.meal_time).getTime() : 0;
        const bTime = b.analysis.meal_time ? new Date(b.analysis.meal_time).getTime() : 0;
        return bTime - aTime;
      });

    if (!scored.length) {
      return Response.json({ found: false });
    }

    const best = scored[0];
    const strongMatches = scored.filter((m) => m.similarity.score >= 65);

    let aggregate = null;
    if (strongMatches.length >= 3) {
      aggregate = {
        count: strongMatches.length,
        matches: strongMatches.slice(0, 6).map((m) => ({ analysis: m.analysis, similarity: m.similarity })),
      };
    }

    return Response.json({
      found: true,
      best: { analysis: best.analysis, similarity: best.similarity, tier: best.tier },
      aggregate,
      currentFingerprint,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}