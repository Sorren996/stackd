// Stackd Insight — Latest Projection Hook (Milestone 5 + continuous learning)
//
// Fetches the newest stored GlucoseProjection for the current user and keeps it
// in step with the newest glucose reading.
//
// DRAWING RULE — one rule, one clock. A projection is drawn while the reading
// it starts from (its anchor) is younger than PROJECTION_FRESH_MS. Nothing
// else gates it here: no meal requirement, no second staleness clock. When the
// newest row is too old to be current the line is hidden cleanly, and it comes
// back the moment a fresh row lands. A stale trajectory is never drawn as if
// it were happening now.
//
// GENERATION RULE — data-driven. A new row is requested only when the stored
// row cannot cover the newest reading: no row at all, or a row anchored before
// that reading. A row already anchored at the newest reading is complete, so
// two tabs asking at once cannot produce duplicate rows.
//
// After a request the read is retried on a short ladder until a row carrying
// the new anchor appears, then it stops. Failures are logged, never swallowed.
//
// SAFETY: `projection` is only ever a non-abstained forecast with a trajectory,
// so nothing draws a misleading empty line. When the engine genuinely withheld
// one, `abstainNote` carries a short plain-language reason instead, so the chart
// can say why rather than leave an unexplained gap.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEffect, useRef, useState } from "react";
import { subscribeProjectionInputsChanged } from "@/lib/projection/projectionStaleness";
import { abstainNoteFor } from "@/lib/projection/projectionNote";

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
  });

  const projection = latestQuery.data?.[0] || null;
  const lastGenRef = useRef(0);
  const inFlightRef = useRef(false);
  const ladderRef = useRef([]);
  // Bumped when a debounced request comes due, so a change that arrived inside
  // the debounce window is never recorded as handled and then forgotten.
  const [attempt, setAttempt] = useState(0);

  // Edits to meals or doses change the forecast's inputs without touching any
  // timestamp, so the reading anchor alone cannot tell that a stored row is
  // out of date. Every carb or dose write (create, edit, delete) marks the
  // inputs as changed, and a mark newer than the stored row forces a rebuild.
  const [inputsChangedAt, setInputsChangedAt] = useState(0);
  useEffect(() => subscribeProjectionInputsChanged((at) => setInputsChangedAt(at)), []);

  const readingMs = latestReadingTime ? Date.parse(latestReadingTime) : NaN;
  const anchorMs = projection?.anchor_time ? Date.parse(projection.anchor_time) : NaN;
  const generatedMs = projection?.generated_at ? Date.parse(projection.generated_at) : NaN;

  const rowCoversReading =
    Boolean(projection) &&
    (!Number.isFinite(readingMs) || (Number.isFinite(anchorMs) && anchorMs >= readingMs));

  // Inputs edited since this row was drawn: rebuild even though the anchor is
  // unchanged. The request is forced, because a row for the same anchor would
  // otherwise be treated as complete and left alone.
  const inputsStale = inputsChangedAt > 0 && (!Number.isFinite(generatedMs) || inputsChangedAt > generatedMs);
  const needsGeneration = !rowCoversReading || inputsStale;

  const clearLadder = () => {
    ladderRef.current.forEach((t) => clearTimeout(t));
    ladderRef.current = [];
  };

  useEffect(() => clearLadder, []);

  const confirmLanded = async (target) => {
    const res = await latestQuery.refetch().catch((error) => {
      console.error("[projection] refetch after generation failed", error);
      return null;
    });
    const row = res?.data?.[0] || null;
    const rowAnchor = row?.anchor_time ? Date.parse(row.anchor_time) : NaN;
    const landed = Number.isFinite(rowAnchor) && (!Number.isFinite(target) || rowAnchor >= target);
    if (landed) clearLadder();
  };

  useEffect(() => {
    if (!needsGeneration || inFlightRef.current) return;

    // Debounce: coalesce a burst of changes into one request, and re-check
    // afterwards instead of dropping the change on the floor.
    const wait = Math.max(0, GENERATION_DEBOUNCE_MS - (Date.now() - lastGenRef.current));
    if (wait > 0) {
      const retry = setTimeout(() => setAttempt((n) => n + 1), wait + 50);
      return () => clearTimeout(retry);
    }

    let cancelled = false;
    const target = Number.isFinite(readingMs) ? readingMs : null;

    lastGenRef.current = Date.now();
    inFlightRef.current = true;

    (async () => {
      try {
        await base44.functions.invoke("generateProjection", inputsStale ? { force: true } : {});
      } catch (error) {
        console.error("[projection] generateProjection failed", error);
      } finally {
        inFlightRef.current = false;
      }

      if (cancelled) return;

      // Retry the read deterministically until the row with the new anchor is
      // there, so the line appears without waiting for the next poll.
      clearLadder();
      ladderRef.current = POST_GENERATION_READ_MS.map((delay) =>
        setTimeout(() => confirmLanded(target), delay)
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [needsGeneration, inputsStale, readingMs, attempt]);

  // Too old to be current — draw nothing rather than a stale trajectory, and say
  // nothing either: a reason about an old anchor would not be true of now.
  if (!projection || !Number.isFinite(anchorMs) || Date.now() - anchorMs > PROJECTION_FRESH_MS) {
    return { projection: null, abstainNote: null };
  }

  const hasTrajectory = Array.isArray(projection.trajectory) && projection.trajectory.length > 0;
  if (projection.abstained || !hasTrajectory) {
    return { projection: null, abstainNote: abstainNoteFor(projection.abstain_reason) };
  }

  return { projection, abstainNote: null };
}