// Stackd Insight Engine — Real-World Validation Report (Milestone 5.1)
//
// Produces a defensible, privacy-safe comparison of the four model
// configurations (baseline, general-personalized, meal-personalized,
// integrated) using the existing shadow-evaluation data stored on
// evaluated GlucoseProjection records.
//
// Milestone 5.1: The report now separately tracks:
//   - Projections with valid immutable input snapshots (eligible for shadow)
//   - Legacy projections excluded because snapshots are missing/invalid
//   - Projections still awaiting a mature evaluation window
//   - Successfully evaluated projections
//   - Eligible and completed shadow comparisons
//   - Failed or ineligible evaluations with reasons
//   - Whether the shadow comparison is methodologically valid
//
// Does NOT fabricate results, inflate sample counts, or declare one model
// superior without uncertainty-aware comparison. Preserves
// `insufficient_evidence` until actual eligible evaluation data supports a
// stronger conclusion. Clearly distinguishes synthetic test results from
// real-world accuracy.
//
// SAFETY: Informational only. Never recommends or prescribes insulin.
// All data is scoped to the authenticated user — no cross-user pooling.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { isSnapshotValid } from "../../shared/projectionSnapshot.ts";

// ── Minimum evidence policy ─────────────────────────────────────────────────
const MIN_COMPARISON_SAMPLES = 5;
const MIN_IMPROVEMENT_MGDL = 1.0;

const SHADOW_CONFIGS = ["baseline", "general_personalized", "meal_personalized", "integrated"] as const;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sr = base44.asServiceRole;

    // Fetch ALL projections for this user (all statuses) for full pipeline
    // transparency.
    const allProjections = await sr.entities.GlucoseProjection.filter(
      { user_id: user.id },
      "-generated_at", 500
    );

    const now = Date.now();

    // ── Meal-response model state and observation counts ──────────────────
    // Separate from projection-level metrics: absorption-estimation and
    // glucose-projection are different targets with different evaluation
    // criteria. Never combine their accuracy.
    const [mealStateRows, mealAnalyses] = await Promise.all([
      sr.entities.MealResponseModelState.filter({ user_id: user.id }, "-created_date", 1),
      sr.entities.MealResponseAnalysis.filter(
        { $or: [{ user_id: user.id }, { created_by_id: user.id }] },
        "-created_date", 500
      ),
    ]);
    const mealState = mealStateRows?.[0] || null;

    const eligibleMealObservations = (mealAnalyses || []).filter((a: any) =>
      a?.analysis_status === "complete" &&
      a?.peak_time != null &&
      a?.starting_glucose != null &&
      Number(a?.maximum_glucose_rise) > 0
    );
    const mealsWithSufficientFollowup = eligibleMealObservations.filter((a: any) =>
      a?.analysis_window_end != null &&
      new Date(a.analysis_window_end).getTime() <= now
    );

    const mealClasses: Record<string, any> = {};
    for (const cls of ["fast", "mixed", "high_fat"]) {
      const cp = mealState?.speed_class_parameters?.[cls];
      mealClasses[cls] = {
        eligible: !mealState?.baseline_locked && cp != null &&
          Number.isFinite(Number(cp.speed_factor)) &&
          Math.abs(Number(cp.speed_factor) - 1.0) > 0.001,
        speedFactor: cp ? Number(cp.speed_factor) : 1.0,
        magnitudeFactor: cp ? Number(cp.magnitude_factor) : 1.0,
        sampleCount: cp?.sample_count ?? 0,
      };
    }

    const mealResponseSection = {
      modelVersion: mealState?.model_version || "1.0.0-meal-baseline",
      baselineLocked: mealState?.baseline_locked ?? true,
      resolutionReason: mealState?.baseline_locked ? "baseline_locked" :
        (Object.values(mealClasses).some((c: any) => c.eligible) ? "personalized_active" : "no_eligible_classes"),
      classes: mealClasses,
      eligibleObservations: eligibleMealObservations.length,
      mealsWithSufficientFollowup: mealsWithSufficientFollowup.length,
      totalAnalyses: mealAnalyses?.length || 0,
      note: "Absorption-estimation accuracy and glucose-projection accuracy are evaluated separately and never combined.",
    };

    // ── Categorize projections by pipeline state ───────────────────────────
    const bufferMs = 10 * 60 * 1000; // EVAL_BUFFER_MIN

    let awaitingMaturity = 0;
    let evaluatedCount = 0;
    let unscorableCount = 0;
    let processingCount = 0;
    let eligibleWithSnapshot = 0;
    let legacyWithoutSnapshot = 0;
    let shadowCompleted = 0;
    let shadowIneligible = 0;

    const exclusionReasons: Record<string, number> = {};
    const shadowIneligibilityReasons: Record<string, number> = {};

    for (const p of allProjections) {
      const status = p.status || "active";

      if (status === "processing") {
        processingCount++;
        continue;
      }

      if (status === "active") {
        // Check if it's awaiting maturity or just hasn't been picked up.
        const generatedAt = new Date(p.generated_at).getTime();
        const horizonMs = (Number(p.horizon_minutes) || 60) * 60 * 1000;
        if (generatedAt + horizonMs + bufferMs > now) {
          awaitingMaturity++;
        }
        continue;
      }

      if (status === "evaluated") {
        evaluatedCount++;

        // Check snapshot eligibility for shadow comparison.
        const snapshotValid = isSnapshotValid(p.input_snapshot);
        if (snapshotValid) {
          eligibleWithSnapshot++;
        } else {
          legacyWithoutSnapshot++;
          const reason = p.input_snapshot ? "invalid_snapshot" : "missing_snapshot";
          shadowIneligibilityReasons[reason] = (shadowIneligibilityReasons[reason] || 0) + 1;
        }

        // Check shadow evaluation status.
        const shadowEligibility = p.shadow_eligibility;
        if (shadowEligibility && shadowEligibility.eligible === false) {
          shadowIneligible++;
          if (shadowEligibility.reason) {
            shadowIneligibilityReasons[shadowEligibility.reason] =
              (shadowIneligibilityReasons[shadowEligibility.reason] || 0) + 1;
          }
        } else if (p.shadow_evaluation && Object.keys(p.shadow_evaluation).length > 0) {
          shadowCompleted++;
        }

        // Collect exclusion reasons from the evaluation.
        if (p.evaluation?.exclusions) {
          for (const ex of p.evaluation.exclusions) {
            if (ex?.reason) {
              exclusionReasons[ex.reason] = (exclusionReasons[ex.reason] || 0) + 1;
            }
          }
        }
        continue;
      }

      if (status === "unscorable") {
        unscorableCount++;
        if (p.evaluation?.reason) {
          exclusionReasons[p.evaluation.reason] = (exclusionReasons[p.evaluation.reason] || 0) + 1;
        }
        if (p.evaluation?.exclusions) {
          for (const ex of p.evaluation.exclusions) {
            if (ex?.reason) {
              exclusionReasons[ex.reason] = (exclusionReasons[ex.reason] || 0) + 1;
            }
          }
        }
        continue;
      }
    }

    // Date range
    const dates = allProjections
      .map((p: any) => new Date(p.generated_at).getTime())
      .filter((t: number) => Number.isFinite(t));
    const dateRange = dates.length > 0
      ? { from: new Date(Math.min(...dates)).toISOString(), to: new Date(Math.max(...dates)).toISOString() }
      : null;

    // Model version distribution
    const modelVersions: Record<string, number> = {};
    for (const p of allProjections) {
      const mv = p.model_version || "unknown";
      modelVersions[mv] = (modelVersions[mv] || 0) + 1;
    }

    // ── Shadow comparison metrics (only from eligible, completed shadows) ──
    const withShadow = allProjections.filter((p: any) =>
      p.status === "evaluated" &&
      p.shadow_evaluation && typeof p.shadow_evaluation === "object" &&
      Object.keys(p.shadow_evaluation).length > 0 &&
      isSnapshotValid(p.input_snapshot)
    );

    // Determine if the shadow comparison is methodologically valid.
    // It is valid only when ALL completed shadow comparisons used snapshots
    // (no legacy projections mixed in). If any shadow was completed without
    // a snapshot, the comparison is methodologically suspect.
    const shadowCompletedTotal = allProjections.filter((p: any) =>
      p.status === "evaluated" &&
      p.shadow_evaluation && Object.keys(p.shadow_evaluation).length > 0
    ).length;
    const shadowMethodologicallyValid = shadowCompletedTotal > 0 &&
      shadowCompletedTotal === withShadow.length;

    // If no shadow evaluations, return insufficient evidence with full
    // pipeline transparency.
    if (withShadow.length === 0) {
      return Response.json({
        status: "insufficient_evidence",
        reason: "no_eligible_shadow_evaluations",
        totalProjections: allProjections.length,
        pipeline: {
          awaitingMaturity,
          evaluated: evaluatedCount,
          unscorable: unscorableCount,
          processing: processingCount,
        },
        snapshotEligibility: {
          eligibleWithSnapshot,
          legacyWithoutSnapshot,
        },
        shadowComparison: {
          completed: shadowCompleted,
          ineligible: shadowIneligible,
          methodologicallyValid: shadowCompletedTotal > 0 ? shadowMethodologicallyValid : null,
          ineligibilityReasons: shadowIneligibilityReasons,
        },
        exclusionReasons,
        dateRange,
        modelVersions,
        mealResponse: mealResponseSection,
        message: "No eligible shadow evaluations have been completed yet. The evaluation pipeline needs mature projections with valid input snapshots before comparisons can be made.",
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
      totalProjections: allProjections.length,
      pipeline: {
        awaitingMaturity,
        evaluated: evaluatedCount,
        unscorable: unscorableCount,
        processing: processingCount,
      },
      snapshotEligibility: {
        eligibleWithSnapshot,
        legacyWithoutSnapshot,
      },
      shadowComparison: {
        completed: shadowCompleted,
        ineligible: shadowIneligible,
        methodologicallyValid: shadowMethodologicallyValid,
        ineligibilityReasons: shadowIneligibilityReasons,
      },
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
      mealResponse: mealResponseSection,
      message: hasEnoughData
        ? `${totalValid} valid shadow evaluations from snapshot-eligible projections. Comparisons use immutable input snapshots for temporally valid replay.`
        : `Only ${totalValid} valid shadow evaluations (need ${MIN_COMPARISON_SAMPLES}). Continue collecting eligible observations with valid snapshots.`,
    });
  } catch (error: any) {
    console.error('[getValidationReport] fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}