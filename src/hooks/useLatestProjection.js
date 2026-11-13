// Stackd Insight — Latest Projection Hook (Milestone 5 + continuous learning)
//
// Fetches the newest stored GlucoseProjection for the current user and keeps it
// in step with the newest glucose reading.
//
// DRAWING RULE — one rule, one clock. A projection is drawn only while its
// anchor covers the newest reading AND is younger than PROJECTION_FRESH_MS
// (12 minutes). When the newest stored row is older than the newest reading or
// older than 12 minutes, nothing is drawn until a current row lands.
//
// GENERATION RULE — server-first, client fallback. Projections are generated on
// the server whenever a reading is ingested or a dose/carb log changes. On
// mount, foreground resume, or a newly arrived reading, this hook reads the
// stored projection first; only if the server row is still missing or anchored
// before the newest reading (or local log inputs were just changed) does the
// client invoke generateProjection as a fallback.
//
// SAFETY: `projection` is only ever a non-abstained forecast with a trajectory,
// so nothing draws a misleading empty line. When the engine genuinely withheld
// one, `abstainNote` carries a short plain-language reason instead.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEffect, useRef, useState } from "react";
import { subscribeProjectionInputsChanged } from "@/lib/projection/projectionStaleness";
import { abstainNoteFor } from "@/lib/projection/projectionNote";
import { useVisibilityRefresh } from "@/hooks/useVisibilityRefresh";

// The single freshness window for drawing a projection.
export const PROJECTION_FRESH_MS = 12 * 60 * 1000;

const REFETCH_INTERVAL_MS = 60 * 1000;
const GENERATION_DEBOUNCE_MS = 20 * 1000;
// Deterministic post-generation reads: soon, a little later, then a last look.
const POST_GENERATION_READ_MS = [1500, 4000, 10000];

export function useLatestProjection({ latestReadingTime } = {}) {
  const latestQuery = useQuery({
    queryKey: ["latest-projection"],
    queryFn: () => base44.entities.GlucoseProjection.list("-generated_at", 1),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30 * 1000,
    networkMode: "always",
  });

  // Re-read the server-generated projection immediately when returning to the
  // app from the background, in parallel with the glucose reading refresh, so
  // the forecast paints with no blank delay on reopen.
  useVisibilityRefresh({
    onRevalidate: (reason) => {
      if (reason === "mount") return;
      latestQuery.refetch({ cancelRefetch: false }).catch(() => {});
    },
  });

  const projection = latestQuery.data?.[0] || null;
  const lastGenRef = useRef(0);
  const inFlightRef = useRef(false);
  const checkedReadingMsRef = useRef(NaN);
  const ladderRef = useRef([]);
  // Bumped when a debounced request comes due, so a change that arrived inside
  // the debounce window is never recorded as handled and then forgotten.
  const [attempt, setAttempt] = useState(0);

  // Edits to meals or doses change the forecast's inputs without touching any
  // reading timestamp. Every carb or dose write marks the inputs as changed,
  // and a mark newer than the stored row forces a rebuild if the server
  // workflow hasn't already written one.
  const [inputsChangedAt, setInputsChangedAt] = useState(0);
  useEffect(() => subscribeProjectionInputsChanged((at) => setInputsChangedAt(at)), []);

  const readingMs = latestReadingTime ? Date.parse(latestReadingTime) : NaN;
  const anchorMs = projection?.anchor_time ? Date.parse(projection.anchor_time) : NaN;
  const generatedMs = projection?.generated_at ? Date.parse(projection.generated_at) : NaN;

  const rowCoversReading =
    Boolean(projection) &&
    (!Number.isFinite(readingMs) || (Number.isFinite(anchorMs) && anchorMs >= readingMs));

  const inputsStale =
    inputsChangedAt > 0 && (!Number.isFinite(generatedMs) || inputsChangedAt > generatedMs);
  const needsGeneration = !rowCoversReading || inputsStale;

  const clearLadder = () => {
    ladderRef.current.forEach((t) => clearTimeout(t));
    ladderRef.current = [];
  };

  useEffect(() => clearLadder, []);

  const confirmLanded = async (target, minGeneratedAt = 0) => {
    const res = await latestQuery.refetch().catch((error) => {
      console.error("[projection] refetch after generation failed", error);
      return null;
    });
    const row = res?.data?.[0] || null;
    const rowAnchor = row?.anchor_time ? Date.parse(row.anchor_time) : NaN;
    const rowGen = row?.generated_at ? Date.parse(row.generated_at) : NaN;
    const anchorOk = Number.isFinite(rowAnchor) && (!Number.isFinite(target) || rowAnchor >= target);
    const genOk = !minGeneratedAt || (Number.isFinite(rowGen) && rowGen >= minGeneratedAt);
    if (anchorOk && genOk) clearLadder();
  };

  useEffect(() => {
    if (!needsGeneration || inFlightRef.current) return;
    // Wait for an in-flight read (initial mount or foreground resume) before
    // concluding that the server is missing a projection for this reading.
    if (!inputsStale && (latestQuery.isPending || latestQuery.isFetching)) return;

    let cancelled = false;
    let retryTimer = null;

    (async () => {
      // Check the server first when a newer reading arrived: ingestion already
      // generates the projection server-side, so a single read usually resolves
      // it immediately without invoking generateProjection.
      if (
        !inputsStale &&
        Number.isFinite(readingMs) &&
        checkedReadingMsRef.current !== readingMs
      ) {
        checkedReadingMsRef.current = readingMs;
        inFlightRef.current = true;
        try {
          const res = await latestQuery.refetch().catch(() => null);
          const freshRow = res?.data?.[0] || null;
          const freshAnchor = freshRow?.anchor_time ? Date.parse(freshRow.anchor_time) : NaN;
          if (Number.isFinite(freshAnchor) && freshAnchor >= readingMs) {
            return;
          }
        } finally {
          inFlightRef.current = false;
        }
        if (cancelled) return;
      }

      // Fallback: server row is still missing/behind or local inputs changed.
      const wait = Math.max(0, GENERATION_DEBOUNCE_MS - (Date.now() - lastGenRef.current));
      if (wait > 0) {
        retryTimer = setTimeout(() => {
          if (!cancelled) setAttempt((n) => n + 1);
        }, wait + 50);
        return;
      }

      const target = Number.isFinite(readingMs) ? readingMs : null;
      const minGen = inputsStale ? inputsChangedAt : 0;

      lastGenRef.current = Date.now();
      inFlightRef.current = true;

      try {
        await base44.functions.invoke("generateProjection", inputsStale ? { force: true } : {});
      } catch (error) {
        console.error("[projection] generateProjection failed", error);
      } finally {
        inFlightRef.current = false;
      }

      if (cancelled) return;

      clearLadder();
      ladderRef.current = POST_GENERATION_READ_MS.map((delay) =>
        setTimeout(() => confirmLanded(target, minGen), delay)
      );
    })();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [needsGeneration, inputsStale, inputsChangedAt, readingMs, attempt, latestQuery.isPending, latestQuery.isFetching]);

  // Never draw a projection whose anchor is older than the newest reading or
  // older than PROJECTION_FRESH_MS (~12 minutes).
  if (
    !projection ||
    !Number.isFinite(anchorMs) ||
    !rowCoversReading ||
    Date.now() - anchorMs > PROJECTION_FRESH_MS
  ) {
    return { projection: null, abstainNote: null };
  }

  const hasTrajectory = Array.isArray(projection.trajectory) && projection.trajectory.length > 0;
  if (projection.abstained || !hasTrajectory) {
    return { projection: null, abstainNote: abstainNoteFor(projection.abstain_reason) };
  }

  return { projection, abstainNote: null };
}