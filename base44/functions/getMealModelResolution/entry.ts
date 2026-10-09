// Stackd Insight Engine — Meal Model Resolution Endpoint
//
// Exposes the user's authoritative MealResponseModelState to the frontend,
// resolved through the same modelResolution logic the projection engine uses.
// This ensures Meal Review consumes the SAME persisted, user-specific resolved
// model state that the backend considers authoritative — not a parallel
// learning entity.
//
// Returns: effective parameters (per-class speedFactor, magnitudeFactor),
// model version, meal model version, eligibility, fallback reason, and
// sample counts. User-scoped: only the authenticated user's state is read.
//
// SAFETY: Informational only. Never recommends or modifies insulin doses.
// SCOPE: speedFactor and magnitudeFactor are empirical corrections — not
// models of carbohydrate absorption physiology. They describe what the
// baseline model tended to get wrong; they never prescribe.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { resolveModelComponents } from "../../shared/modelResolution.ts";
import {
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "../../shared/insightEngine.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch ONLY the authenticated user's meal model state.
    const mealStateRows = await base44.asServiceRole.entities.MealResponseModelState.filter(
      { user_id: user.id }, "-created_date", 1
    );
    const mealState = (mealStateRows && mealStateRows.length > 0) ? mealStateRows[0] : null;

    // Resolve using the same logic as generateProjection.
    const resolution = resolveModelComponents(null, mealState);

    // Build the user-facing response with per-class details.
    const classes: Record<string, any> = {};
    for (const cls of ["fast", "mixed", "high_fat"]) {
      const cr = resolution.meal.classes[cls];
      if (cr) {
        classes[cls] = {
          eligible: cr.eligible,
          speedFactor: cr.speedFactor,
          magnitudeFactor: cr.magnitudeFactor,
          reason: cr.reason,
          source: cr.source,
          sampleCount: mealState?.speed_class_parameters?.[cls]?.sample_count ?? 0,
        };
      } else {
        classes[cls] = {
          eligible: false,
          speedFactor: 1.0,
          magnitudeFactor: 1.0,
          reason: "no_params",
          source: "baseline",
          sampleCount: 0,
        };
      }
    }

    return Response.json({
      ok: true,
      mealModelVersion: resolution.mealModelVersion,
      baselineLocked: mealState?.baseline_locked ?? true,
      resolutionReason: resolution.meal.reason,
      classes,
      sampleCountsByClass: mealState?.sample_counts_by_class ?? { fast: 0, mixed: 0, high_fat: 0 },
      hasState: Boolean(mealState),
    });
  } catch (error: any) {
    console.error("[getMealModelResolution] error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}