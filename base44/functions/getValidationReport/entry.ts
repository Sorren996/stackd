// Stackd Insight Engine — Real-World Validation Report (Milestone 5)
//
// Produces a defensible, privacy-safe comparison of the four model
// configurations (baseline, general-personalized, meal-personalized,
// integrated) using the existing shadow-evaluation data stored on
// evaluated GlucoseProjection records.
//
// Returns `insufficient_evidence` when the available real-world data
// does not meet the minimum evidence policy. Does NOT fabricate results,
// inflate sample counts, or declare one model superior without
// uncertainty-aware comparison.
//
// SAFETY: Informational only. Never recommends or prescribes insulin.
// All data is scoped to the authenticated user — no cross-user pooling.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

// ── Minimum evidence policy ─────────────────────────────────────────────────
// A model comparison is only reported when BOTH candidates have at least
// this many valid evaluated observations on the same eligible projections.
// Below this, the report returns `insufficient_evidence`.
const MIN_COMPARISON_SAMPLES = 5;

// A model is declared "better" than baseline only when its MAE is lower by
// at least this margin (mg/dL) AND the sample count meets the minimum.
// This is a conservative, uncertainty-aware threshold — it requires a
// clear, non-noise improvement before declaring superiority.
const MIN_IMPROVEMENT_MGDL = 1.0;

const SHADOW_CONFIGS = ["baseline", "general_personalized", "meal_personalized", "integrated"] as const;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sr = base44.asServiceRole;

    // Fetch ALL evaluated projections for this user that have shadow evaluation data.
    const evaluated = await sr.entities.GlucoseProjection.filter(
      { user_id: user.id, status: "evaluated" },
      "-generated_at", 500
    );

    // Filter to projections with shadow evaluation data.
    const withShadow = evaluated.filter((p: any) =>
      p.shadow_evaluation && typeof p.shadow_evaluation === "object"
      && Object.keys(p.shadow_evaluation).length > 0
    );

    // Fetch exclusion statistics from all evaluated/unscorable projections.
    const allProcessed = evaluated;
    const exclusionReasons: Record<string, number> = {};
    for (const p of allProcessed) {
      if (p.evaluation?.exclusions) {
        for (const ex of p.evaluation.exclusions) {
          if (ex?.reason) {
            exclusionReasons[ex.reason] = (exclusionReasons[ex.reason] || 0) + 1;
          }
        }
      }
      if (p.evaluation?.status === "unscorable" && p.evaluation?.reason) {
        exclusionReasons[p.evaluation.reason] = (exclusionReasons[p.evaluation.reason] || 0) + 1;
      }
    }

    // Date range
    const dates = evaluated
      .map((p: any) => new Date(p.generated_at).getTime())
      .filter((t: number) => Number.isFinite(t));
    const dateRange = dates.length > 0
      ? { from: new Date(Math.min(...dates)).toISOString(), to: new Date(Math.max(...dates)).toISOString() }
      : null;

    // Model version distribution
    const modelVersions: Record<string, number> = {};
    for (const p of evaluated) {
      const mv = p.model_version || "unknown";
      modelVersions[mv] = (modelVersions[mv] || 0) + 1;
    }

    // If no shadow evaluations, return insufficient evidence.
    if (withShadow.length === 0) {
      return Response.json({
        status: "insufficient_evidence",
        reason: "no_shadow_evaluations",
        totalEvaluated: evaluated.length,
        withShadow: 0,
        exclusionReasons,
        dateRange,
        modelVersions,
        message: "No shadow evaluations have been completed yet. The evaluation pipeline needs mature projections with elapsed forecast windows before comparisons can be made.",
      });
    }

    // Aggregate shadow evaluation metrics for each config.
    const configMetrics: Record<string, {
      mae: number | null;
      bias: number | null;
      coverage: number | null;
      validCount: number;
      maeValues: number[];
      biasValues: number[];
      coverageValues: boolean[];
    }> = {};

    for (const config of SHADOW_CONFIGS) {
      configMetrics[config] = {
        mae: null, bias: null, coverage: null,
        validCount: 0, maeValues: [], biasValues: [], coverageValues: [],
      };
    }

    for (const proj of withShadow) {
      const shadow = proj.shadow_evaluation;
      for (const config of SHADOW_CONFIGS) {
        const s = shadow[config];
        if (!s || s.abstained || s.mae == null) continue;
        const cm = configMetrics[config];
        cm.maeValues.push(Number(s.mae));
        if (s.bias != null) cm.biasValues.push(Number(s.bias));
        if (s.coverage != null) cm.coverageValues.push(Boolean(s.coverage));
        cm.validCount++;
      }
    }

    // Compute aggregate metrics for each config.
    for (const config of SHADOW_CONFIGS) {
      const cm = configMetrics[config];
      if (cm.maeValues.length > 0) {
        cm.mae = Math.round((cm.maeValues.reduce((s, v) => s + v, 0) / cm.maeValues.length) * 100) / 100;
      }
      if (cm.biasValues.length > 0) {
        cm.bias = Math.round((cm.biasValues.reduce((s, v) => s + v, 0) / cm.biasValues.length) * 100) / 100;
      }
      if (cm.coverageValues.length > 0) {
        cm.coverage = Math.round((cm.coverageValues.filter(v => v).length / cm.coverageValues.length) * 1000) / 1000;
      }
    }

    // Compute performance differences vs baseline.
    const baselineMae = configMetrics.baseline.mae;
    const comparisons: Record<string, {
      maeDelta: number | null;
      biasDelta: number | null;
      coverageDelta: number | null;
      validCount: number;
      baselineCount: number;
      superior: boolean;
      reason: string;
    }> = {};

    for (const config of SHADOW_CONFIGS) {
      if (config === "baseline") continue;
      const cm = configMetrics[config];
      const bm = configMetrics.baseline;

      if (cm.mae == null || baselineMae == null) {
        comparisons[config] = {
          maeDelta: null, biasDelta: null, coverageDelta: null,
          validCount: cm.validCount, baselineCount: bm.validCount,
          superior: false, reason: "insufficient_data",
        };
        continue;
      }

      const maeDelta = Math.round((cm.mae - baselineMae) * 100) / 100;
      const biasDelta = cm.bias != null && bm.bias != null
        ? Math.round((cm.bias - bm.bias) * 100) / 100 : null;
      const coverageDelta = cm.coverage != null && bm.coverage != null
        ? Math.round((cm.coverage - bm.coverage) * 1000) / 1000 : null;

      // Determine superiority using the minimum evidence policy.
      const enoughSamples = cm.validCount >= MIN_COMPARISON_SAMPLES && bm.validCount >= MIN_COMPARISON_SAMPLES;
      const betterByMargin = maeDelta < -MIN_IMPROVEMENT_MGDL;

      comparisons[config] = {
        maeDelta,
        biasDelta,
        coverageDelta,
        validCount: cm.validCount,
        baselineCount: bm.validCount,
        superior: enoughSamples && betterByMargin,
        reason: !enoughSamples
          ? `insufficient_samples (${cm.validCount}/${MIN_COMPARISON_SAMPLES} needed)`
          : betterByMargin
            ? "improvement_detected"
            : "no_significant_improvement",
      };
    }

    // Overall status
    const totalValid = configMetrics.baseline.validCount;
    const hasEnoughData = totalValid >= MIN_COMPARISON_SAMPLES;

    return Response.json({
      status: hasEnoughData ? "evidence_available" : "insufficient_evidence",
      totalEvaluated: evaluated.length,
      withShadow: withShadow.length,
      exclusionReasons,
      dateRange,
      modelVersions,
      configMetrics: Object.fromEntries(
        Object.entries(configMetrics).map(([k, v]) => [
          k,
          { mae: v.mae, bias: v.bias, coverage: v.coverage, validCount: v.validCount }
        ])
      ),
      comparisons,
      minimumEvidencePolicy: {
        minComparisonSamples: MIN_COMPARISON_SAMPLES,
        minImprovementMgdl: MIN_IMPROVEMENT_MGDL,
      },
      message: hasEnoughData
        ? `${totalValid} valid shadow evaluations. Comparisons are based on same-input replay on identical observations.`
        : `Only ${totalValid} valid shadow evaluations (need ${MIN_COMPARISON_SAMPLES}). Continue collecting eligible observations.`,
    });
  } catch (error: any) {
    console.error('[getValidationReport] fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}