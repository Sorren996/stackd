// Stackd Insight Engine — Backtest on stored forecasts.
//
// Replays every saved forecast from its immutable input snapshot through the
// CURRENT engine, then scores both the stored prediction and the replayed one
// against the same recorded outcome. That is the only fair way to answer "is
// the new model better": identical inputs, identical outcomes, two models.
//
// Admin-only: it reads across all users' projections through the service role.
//
// SAFETY: informational accuracy measurement only. Never a dose calculation.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { replayFromSnapshot } from "../../shared/projectionSnapshot.ts";
import { createBaselineResolution } from "../../shared/modelResolution.ts";

const HORIZONS = [15, 30, 60];
const BANDS = [30, 45];

function emptyStats() {
  const s = { count: 0, maeSum: 0, biasSum: 0 };
  for (const band of BANDS) s[`within${band}`] = 0;
  s.mae = null;
  s.bias = null;
  for (const band of BANDS) s[`pctWithin${band}`] = null;
  return s;
}

function addScore(stats, predicted, actual) {
  stats.count += 1;
  const error = predicted - actual;
  stats.maeSum += Math.abs(error);
  stats.biasSum += error;
  for (const band of BANDS) {
    if (Math.abs(error) <= band) stats[`within${band}`] += 1;
  }
}

function finish(stats) {
  if (!stats.count) return { ...stats, mae: null, bias: null };
  stats.mae = Math.round((stats.maeSum / stats.count) * 10) / 10;
  stats.bias = Math.round((stats.biasSum / stats.count) * 10) / 10;
  for (const band of BANDS) {
    stats[`pctWithin${band}`] = Math.round((stats[`within${band}`] / stats.count) * 1000) / 10;
  }
  delete stats.maeSum;
  delete stats.biasSum;
  return stats;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth
      .me()
      .catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 300, 20), 500);

    const page = await base44.asServiceRole.entities.GlucoseProjection.filter(
      { status: "evaluated" },
      { sort: "-generated_at", limit }
    );
    const projections = page?.items || (Array.isArray(page) ? page : []);

    const previous = {}; // stored predictions, scored against the same outcome
    const current = {}; // this engine, replayed from each snapshot
    for (const h of HORIZONS) {
      previous[h] = emptyStats();
      current[h] = emptyStats();
    }
    let replayed = 0;
    let abstained = 0;
    let skippedNoSnapshot = 0;

    const resolution = createBaselineResolution();

    for (const projection of projections) {
      if (!projection?.input_snapshot) {
        skippedNoSnapshot += 1;
        continue;
      }
      const storedHorizons = Array.isArray(projection?.evaluation?.horizons)
        ? projection.evaluation.horizons
        : [];
      const outcomes = {};
      for (const h of storedHorizons) {
        if (h?.scored && Number.isFinite(h.actual)) outcomes[h.horizon_min] = h;
      }
      if (!Object.keys(outcomes).length) continue;

      const horizonMinutes = Number(projection.horizon_minutes) || 60;
      const replay = replayFromSnapshot(
        projection.input_snapshot,
        horizonMinutes,
        resolution,
        null
      );
      replayed += 1;
      if (replay.abstained || !replay.trajectory?.length) {
        abstained += 1;
        continue;
      }

      for (const h of HORIZONS) {
        const outcome = outcomes[h];
        if (!outcome) continue;
        if (Number.isFinite(outcome.predicted)) {
          addScore(previous[h], outcome.predicted, outcome.actual);
        }
        const point = replay.trajectory.find((p) => p.min_offset === h);
        if (point && Number.isFinite(point.value)) {
          addScore(current[h], point.value, outcome.actual);
        }
      }
    }

    const horizons = {};
    for (const h of HORIZONS) {
      horizons[h] = {
        stored_engine: finish(previous[h]),
        current_engine: finish(current[h]),
      };
    }

    return Response.json({
      projectionsScanned: projections.length,
      projectionsScored: replayed,
      abstained,
      skippedNoSnapshot,
      horizonMinutes: HORIZONS,
      bandsMgdl: BANDS,
      horizons: Object.fromEntries(Object.entries(horizons).map(([k, v]) => [String(k), v])),
      note: "Both engines scored on the same stored outcomes. A lower MAE and a higher % within band are better.",
    });
  } catch (error) {
    console.log("backtestProjectionEngine failed:", error?.message);
    return Response.json({ error: error?.message || "Backtest failed" }, { status: 500 });
  }
}