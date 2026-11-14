// Stackd Insight — Projection Overlay (Milestone 5)
//
// Renders the projected glucose trajectory as a restrained dashed line with a
// subtle uncertainty band, overlaid on the ActivityGraph's glucose row. The
// overlay is positioned inside the scrollable chart container so it scrolls and
// scales with the existing graph.
//
// DESIGN PRINCIPLES:
//   - Observed CGM readings remain the solid, prominent line.
//   - Projected values are a muted, dashed amber line (#AF751B, 5 5, 2px, round
//     caps) drawn with the same shape-preserving smoothing as the measured
//     line — never a chain of straight segments.
//   - The uncertainty band is #AF751B at 10% opacity, no stroke, also smoothed.
//   - No confidence percentages, model versions, or parameter values are shown
//     to the user — just the visual trajectory.
//   - Tapping a past reading opens an editorial card: WHEN, WHAT, HOW SURE.
//   - Dragging scrubs: the marker follows the finger, the readout snaps.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//
//   1. A LABEL NEVER COMES FROM THE CLOCK. A forecast point is labelled from the
//      trajectory's own min_offset ("estimated in 20 min"), so it is always
//      +5, +10, +15 … A real reading is labelled from its own age against
//      server time ("now" under 90 seconds, otherwise "N min ago"). Wall-clock
//      rounding never produces "+1m", and a reading that has not posted cannot
//      appear as the anchor.
//
//   2. THE DASHED LINE IS ONLY THE FUTURE. It starts at the tip of the solid
//      line — the newest real reading — and every point before that reading is
//      dropped. The solid line is the record of what happened; a forecast never
//      draws over it and the card can never select a forecast point that has
//      since become a real reading.
//
// ONE GESTURE MODEL. There is no separate hit area, snap list and offset
// animator any more, because three mechanisms placing the same dot is what made
// the scrub fight itself:
//
//   - POSITION comes from the finger. While the plot is being scrubbed the dot
//     sits exactly at the finger's x (clamped to the first reading and the last
//     forecast point) and at the y the drawn polyline has at that x, so it rides
//     the trace — readings and dashes alike — instead of hopping between points.
//   - THE READOUT snaps. Finger x becomes a time in the chart's content space,
//     and the entry with the nearest own time supplies the numbers: a forecast
//     point feeds the estimate strip, a reading feeds nothing mid-drag.
//   - THE GESTURE is claimed once. Horizontal movement belongs to the scrub, the
//     scroll container is pinned for its duration, and a scrub never cancels.
//
// SAFETY: This is an informational wellness estimate, never a clinical
// prediction.

import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import ProjectionTooltipCard, {
  projectionCardCopy,
  CARD_WIDTH_PX,
  CARD_HEIGHT_PX,
} from "@/components/graph/ProjectionTooltipCard";
import { useServerNow } from "@/lib/serverClock";
import { onGlucoseUnitsChange } from "@/lib/glucoseUnits";
import { monotoneXPath } from "@/lib/monotonePath";
import {
  nearestPointByTime,
  interpolatePolylineY,
  timeAtContentX,
  resolveCardFlip,
  resolveGestureIntent,
} from "@/lib/projection/projectionScrub";
import { BAR_HEIGHT } from "@/components/nav/navGeometry";

const MARGIN = 8;
const CARD_GAP = 12; // px between the marker and the card
// The floating pill nav never gets a card on top of it.
const NAV_CLEARANCE = BAR_HEIGHT + 34;
// Scroll and resize dismissal stay quiet for a moment after a gesture, so the
// tail of a scrub cannot blink the card away.
const DISMISS_GRACE_MS = 350;

// The horizontally scrollable window the chart is seen through. It is both the
// content-space origin for the scrub mapping and the box the card is clamped to.
function scrollParentOf(el) {
  let node = el?.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) && node.clientWidth > 0) return node;
    node = node.parentElement;
  }
  return null;
}

// The vertical scroller a cancelled gesture hands its movement to.
function verticalScrollerOf(el) {
  let node = el?.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || null;
}

function pointAgeSeconds(point, nowMs) {
  if (!Number.isFinite(point?.time) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.round((nowMs - point.time) / 1000));
}

export default function ProjectionOverlay({
  projection,
  domainStart,
  totalMs,
  chartWidth,
  glucoseChartHeight,
  glucoseMarginTop,
  plotHeight,
  effectiveMin,
  effectiveMax,
  getGlucoseY,
  latestReading = null,
  readings = [],
  // The chart's own scroll container. The plot is wider than the screen, so a
  // clientX only means a time once the scroll offset is added back in.
  scrollContainerRef = null,
  // A forecast point is described by the estimate strip above the chart, so it
  // is reported to the parent instead of opening the cream card. A real reading
  // still opens the card: it is a measurement, not an estimate.
  onForecastSelect = null,
  // Bumped by the Now button, which returns to the newest reading and fades the
  // strip out by releasing the scrub.
  resetSignal = 0,
}) {
  // The snapped entry: what the numbers show.
  const [activePoint, setActivePoint] = useState(null);
  // The finger's own position, in the chart's content space: where the dot is.
  const [finger, setFinger] = useState(null);
  const [scrubbing, setScrubbing] = useState(false);
  // The cream card belongs to a tap and only to a tap: a drag never opens it,
  // and it closes the moment a drag begins.
  const [cardShown, setCardShown] = useState(false);
  const svgRef = useRef(null);
  const hitRef = useRef(null);

  // Gesture state machine: "idle" | "pending" | "scrubbing" | "cancelled".
  // One decision, made on the first movement, never revisited.
  const gestureStateRef = useRef("idle");
  const tapStartRef = useRef({ x: 0, y: 0 });
  const pointerPosRef = useRef(null);
  const pointerIdRef = useRef(null);
  // The entries this gesture works against. A reading that arrives mid-drag must
  // not move the trace under the finger, so the projection is frozen for as long
  // as the finger is down.
  const gesturePointsRef = useRef(null);
  const frameRef = useRef(null);
  // The pinned scroll container: the chart must not pan while a scrub is running.
  const pinRef = useRef(null);
  // Where a gesture cancelled to a scroll sends its vertical movement.
  const handoffRef = useRef(null);
  // The dot's current position, so a frame that has not moved it costs nothing.
  const fingerRef = useRef(null);

  const [pos, setPos] = useState({ left: 0, top: 0, ready: false, flipped: false });
  const nowMs = useServerNow();
  // The card prints glucose in the reader's chosen unit, so a change of that
  // setting must repaint it at once rather than at the next clock tick.
  const [, setUnitsTick] = useState(0);
  useEffect(() => onGlucoseUnitsChange(() => setUnitsTick((t) => t + 1)), []);

  // The one resolved selection, readable synchronously by the per-frame scrub
  // resolver, so a frame can tell whether the entry actually changed.
  const activePointRef = useRef(null);
  const select = useCallback((next) => {
    if (activePointRef.current === next) return;
    activePointRef.current = next;
    setActivePoint(next);
  }, []);

  // One report per selection change, never per frame. The parent draws the
  // estimate strip from this; null clears it and the strip fades itself out.
  useEffect(() => {
    if (!onForecastSelect) return;
    onForecastSelect(activePoint && activePoint.kind === "forecast" ? activePoint : null);
  }, [activePoint, onForecastSelect]);

  // The Now button releases the scrub, so the marker returns to the newest
  // reading and the strip fades away with it.
  const lastResetRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastResetRef.current) return;
    lastResetRef.current = resetSignal;
    select(null);
    setCardShown(false);
    fingerRef.current = null;
    setFinger(null);
  }, [resetSignal, select]);

  // The current flip, kept so the card's deadband has something to compare to.
  const flippedRef = useRef(false);
  // Scroll and resize dismissal are held off during a gesture and just after it.
  const dismissSuppressUntilRef = useRef(0);

  // The newest real reading: the tip of the solid line, and the only place the
  // dashed line may start. Without one there is nothing to anchor to.
  const anchorReading = useMemo(() => {
    const time = new Date(latestReading?.time ?? latestReading?.recorded_at).getTime();
    const value = Number(latestReading?.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
    return { time, value };
  }, [latestReading]);

  const points = useMemo(() => {
    if (!projection || !projection.trajectory || projection.abstained) return [];
    const forecast = projection.trajectory
      .map((p) => {
        const t = new Date(p.time).getTime();
        if (!Number.isFinite(t)) return null;
        const value = Number(p.value);
        if (!Number.isFinite(value)) return null;
        const minOffset = Number(p.min_offset);
        return {
          time: t,
          value,
          minOffset: Number.isFinite(minOffset) ? minOffset : null,
          lower: Number.isFinite(Number(p.lower)) ? Math.round(Number(p.lower)) : null,
          upper: Number.isFinite(Number(p.upper)) ? Math.round(Number(p.upper)) : null,
        };
      })
      .filter(Boolean)
      // Only the future: a point at or before the newest real reading is
      // already history and must never be drawn or selectable as a forecast.
      .filter((p) => (anchorReading ? p.time > anchorReading.time : true))
      .sort((a, b) => a.time - b.time);

    let lastOffset = 0;
    const plotted = [];
    if (anchorReading) {
      // Re-anchor: the dashed line begins at the reading's own value, so it
      // meets the tip of the solid line instead of floating beside it.
      plotted.push({
        time: anchorReading.time,
        value: anchorReading.value,
        minOffset: 0,
        lower: null,
        upper: null,
        kind: "reading",
      });
    }
    for (const point of forecast) {
      // Labels come from the trajectory's own spacing, never from the clock.
      const offset = point.minOffset != null
        ? point.minOffset
        : Math.round((point.time - anchorReading.time) / 60000);
      const stepped = Math.max(lastOffset + 1, Math.round(offset));
      lastOffset = stepped;
      plotted.push({ ...point, minOffset: stepped, kind: "forecast" });
    }

    return plotted.map((p) => {
      const x = ((p.time - domainStart) / totalMs) * chartWidth;
      return { ...p, x, y: getGlucoseY(p.value) };
      // Every forecast point the engine produced is kept: the plot's future
      // region is sized to the horizon, so none of them may be dropped here.
    }).filter((p) => Number.isFinite(p.x));
  }, [projection, domainStart, totalMs, chartWidth, getGlucoseY, anchorReading]);

  const forecastPoints = useMemo(() => points.filter((p) => p.kind === "forecast"), [points]);
  const hasFuture = forecastPoints.length > 0;

  // ── One list for the whole plot ───────────────────────────────────────
  // Every drawn reading, then the anchor, then the forecast grid. This is the
  // polyline the marker is read off and the set of entries the readout snaps to:
  // one gesture crosses from the solid line into the dashes and back, and
  // nothing in the middle is skipped.
  const merged = useMemo(() => {
    const project = (time, value, kind) => ({
      time,
      value,
      kind,
      x: ((time - domainStart) / totalMs) * chartWidth,
      y: getGlucoseY(value),
    });
    const inPlot = (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= chartWidth;
    const anchorTime = anchorReading ? anchorReading.time : null;

    const past = [];
    for (const reading of readings || []) {
      const time = Number.isFinite(reading?.time) ? reading.time : new Date(reading?.recorded_at).getTime();
      const value = Number(reading?.value);
      if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
      // The anchor itself arrives with the trajectory below, and the dashed line
      // may only start there.
      if (anchorTime != null && time >= anchorTime) continue;
      const point = project(time, value, "reading");
      if (inPlot(point)) past.push(point);
    }
    // Without a trajectory the newest reading is still the right-hand boundary,
    // and still a real point to sit on.
    if (anchorReading && points.length === 0) {
      const point = project(anchorReading.time, anchorReading.value, "reading");
      if (inPlot(point)) past.push(point);
    }

    past.sort((a, b) => a.x - b.x);
    return [...past, ...points];
  }, [readings, points, anchorReading, domainStart, totalMs, chartWidth, getGlucoseY]);

  const mergedRef = useRef(merged);
  mergedRef.current = merged;

  // ── ONE SOURCE FOR THE LINE AND THE GESTURE ───────────────────────────
  // The dashed continuation is the TAIL OF THIS SAME ARRAY, cut from the newest
  // real reading onward. The forecast is therefore literally the continuation of
  // the readings' polyline: it cannot drift from the marker that rides it, and
  // there is no second projection element, second handler or independently
  // positioned copy anywhere in this file.
  const dashPoints = useMemo(() => {
    let lastReading = -1;
    merged.forEach((p, i) => {
      if (p.kind === "reading") lastReading = i;
    });
    return lastReading >= 0 ? merged.slice(lastReading) : merged;
  }, [merged]);

  // Where the marker sits when nothing is selected: the newest real reading,
  // never the horizon. The plot shows exactly one dot, and it belongs to this
  // overlay (the graph itself no longer paints one).
  const restingPoint = useMemo(() => {
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      if (merged[i].kind === "reading") return merged[i];
    }
    return merged.length ? merged[merged.length - 1] : null;
  }, [merged]);

  // ── Content-space mapping ─────────────────────────────────────────────
  // The plot lives inside a horizontally scrolling container, so the finger's
  // clientX is only meaningful once the container's own rect and scroll offset
  // are added back in. This is the chart's content space, the same space the
  // chart's own x values live in.
  const contentXOf = useCallback((clientX) => {
    const el = scrollContainerRef?.current || scrollParentOf(hitRef.current);
    if (!el) return clientX;
    const rect = el.getBoundingClientRect();
    return clientX - rect.left + el.scrollLeft;
  }, [scrollContainerRef]);

  const cancelFrame = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  // ── One scrub frame ───────────────────────────────────────────────────
  // Position comes from the finger; the numbers come from the entry nearest that
  // position in time. The dot is clamped to the first reading and the last
  // forecast point, and its y is the drawn polyline's y at that x — so it rides
  // the line instead of hopping between entries.
  const applyScrub = useCallback(() => {
    frameRef.current = null;
    const source = gesturePointsRef.current;
    const pointer = pointerPosRef.current;
    if (!source || !source.length || !pointer) return;

    const contentX = contentXOf(pointer.clientX);
    // The dot stops at the first reading and the last forecast point, and never
    // leaves the plot.
    const lower = Math.max(source[0].x, 0);
    const upper = Math.min(source[source.length - 1].x, chartWidth);
    const clampedX = Math.min(Math.max(contentX, lower), Math.max(lower, upper));
    const y = interpolatePolylineY(source, clampedX);
    const prev = fingerRef.current;
    if (!prev || Math.abs(prev.x - clampedX) > 0.5 || Math.abs(prev.y - y) > 0.5) {
      fingerRef.current = { x: clampedX, y };
      setFinger(fingerRef.current);
    }

    const time = timeAtContentX(contentX, domainStart, totalMs, chartWidth);
    const nearest = nearestPointByTime(source, time);
    if (nearest) select(nearest);
  }, [contentXOf, domainStart, totalMs, chartWidth, select]);

  const scheduleScrub = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(applyScrub);
  }, [applyScrub]);

  // ── Pinning the scroller ──────────────────────────────────────────────
  // For as long as the finger is down the chart does not pan: the offset is
  // saved on pointerdown, held there, and restored on release.
  // While the finger owns the plot the chart does not scroll at all: the offset
  // is held, and the container's own overflow-x is switched off for the duration
  // — the browser bounces an `auto` scroller at its ends, and a scroller that
  // cannot scroll has nothing to bounce. Everything is restored on release.
  const releasePin = useCallback(() => {
    const pin = pinRef.current;
    if (!pin) return;
    pin.el.removeEventListener("scroll", pin.onScroll);
    pin.el.scrollLeft = pin.left;
    pin.el.style.overflowX = pin.previousOverflowX;
    pinRef.current = null;
  }, []);

  const pinScroller = useCallback(() => {
    releasePin();
    const el = scrollContainerRef?.current || scrollParentOf(hitRef.current);
    if (!el) return;
    const left = el.scrollLeft;
    const previousOverflowX = el.style.overflowX;
    el.style.overflowX = "hidden";
    const onScroll = () => {
      if (el.scrollLeft !== left) el.scrollLeft = left;
    };
    pinRef.current = { el, left, onScroll, previousOverflowX };
    el.addEventListener("scroll", onScroll, { passive: true });
  }, [releasePin, scrollContainerRef]);

  useEffect(() => () => {
    cancelFrame();
    releasePin();
  }, [cancelFrame, releasePin]);

  const handlePointerDown = useCallback((e) => {
    if (!merged.length || !e.isPrimary) return;
    // A press closes whatever card was open: it comes back only if this gesture
    // ends as a tap on a reading.
    setCardShown(false);
    fingerRef.current = null;
    setFinger(null);
    gestureStateRef.current = "pending";
    gesturePointsRef.current = merged;
    tapStartRef.current = { x: e.clientX, y: e.clientY };
    pointerPosRef.current = { clientX: e.clientX };
    pointerIdRef.current = e.pointerId;
    pinScroller();
    handoffRef.current = { el: verticalScrollerOf(hitRef.current), lastY: e.clientY };
    try {
      hitRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported — events still arrive on the layer */
    }
  }, [merged, pinScroller]);

  const handlePointerMove = useCallback((e) => {
    const state = gestureStateRef.current;

    if (state === "pending") {
      const intent = resolveGestureIntent(
        e.clientX - tapStartRef.current.x,
        e.clientY - tapStartRef.current.y
      );
      // A few pixels either way is not a decision yet.
      if (!intent) return;
      if (intent === "scroll") {
        gestureStateRef.current = "cancelled";
        return;
      }
      // Locked: from here the scrub owns the gesture, whatever the finger does.
      gestureStateRef.current = "scrubbing";
      setScrubbing(true);
    }

    if (gestureStateRef.current === "scrubbing") {
      // The plot owns this gesture: the browser must not pan, scroll or zoom.
      if (e.cancelable) e.preventDefault();
      pointerPosRef.current = { clientX: e.clientX };
      scheduleScrub();
      return;
    }

    if (gestureStateRef.current === "cancelled") {
      // Cancelled before it began: the page follows the finger by hand, because
      // the scrub layer's own touch-action is none.
      const handoff = handoffRef.current;
      if (handoff?.el) {
        const dy = e.clientY - handoff.lastY;
        handoff.lastY = e.clientY;
        if (dy) handoff.el.scrollTop -= dy;
      }
    }
  }, [scheduleScrub]);

  const endGesture = useCallback(() => {
    try {
      if (pointerIdRef.current != null) hitRef.current?.releasePointerCapture(pointerIdRef.current);
    } catch {
      /* already released or never captured */
    }
    cancelFrame();
    releasePin();
    const state = gestureStateRef.current;
    gestureStateRef.current = "idle";
    pointerIdRef.current = null;
    pointerPosRef.current = null;
    gesturePointsRef.current = null;
    handoffRef.current = null;
    // A scroll or resize nudge just after the finger lifts must not dismiss.
    dismissSuppressUntilRef.current = Date.now() + DISMISS_GRACE_MS;
    if (state === "scrubbing") {
      setScrubbing(false);
    }
    // The dot falls back from the finger to the entry the numbers show.
    fingerRef.current = null;
    setFinger(null);
    return state;
  }, [cancelFrame, releasePin]);

  const handlePointerUp = useCallback(() => {
    const state = endGesture();
    if (state !== "pending") return;

    // A tap, not a drag: the nearest entry decides, and only a past reading
    // opens its card.
    const contentX = contentXOf(tapStartRef.current.x);
    const time = timeAtContentX(contentX, domainStart, totalMs, chartWidth);
    const nearest = nearestPointByTime(mergedRef.current, time);
    if (nearest && nearest.kind === "reading") {
      const same = activePointRef.current
        && activePointRef.current.x === nearest.x
        && activePointRef.current.kind === nearest.kind;
      select(same ? null : nearest);
      setCardShown(!same);
    } else {
      select(null);
      setCardShown(false);
    }
  }, [endGesture, contentXOf, domainStart, totalMs, chartWidth, select]);

  const handlePointerCancel = useCallback(() => {
    endGesture();
  }, [endGesture]);

  // ── Keyboard accessibility ───────────────────────────────────────────
  // Arrow keys step through the same merged list the finger uses: readings
  // first, then the forecast.
  const handleKeyDown = useCallback((e) => {
    if (!merged.length) return;
    const currentIndex = activePoint
      ? merged.findIndex((p) => p.x === activePoint.x && p.kind === activePoint.kind)
      : -1;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp": {
        e.preventDefault();
        const next = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, merged.length - 1);
        select(merged[next]);
        setCardShown(merged[next].kind === "reading");
        break;
      }
      case "ArrowLeft":
      case "ArrowDown": {
        e.preventDefault();
        const prev = currentIndex < 0 ? merged.length - 1 : Math.max(currentIndex - 1, 0);
        select(merged[prev]);
        setCardShown(merged[prev].kind === "reading");
        break;
      }
      case "Escape": {
        e.preventDefault();
        select(null);
        setCardShown(false);
        fingerRef.current = null;
        setFinger(null);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const opening = !activePointRef.current;
        select(opening ? merged[0] : null);
        setCardShown(opening && merged[0].kind === "reading");
        break;
      }
      default:
        break;
    }
  }, [merged, activePoint, select]);

  // Non-passive touch listener: while a scrub is running the browser is told not
  // to treat the movement as a scroll. touch-action is none on the layer itself,
  // so this is the belt to that braces.
  useEffect(() => {
    const el = hitRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (gestureStateRef.current === "scrubbing" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [merged.length]);

  // Only a tap on a real reading opens the cream card. A drag never does, and a
  // forecast point never does: the strip above the chart is its surface.
  const cardPoint = cardShown && activePoint && activePoint.kind === "reading" ? activePoint : null;

  // Resolve the card's position: above the point, flipped below when it would
  // cross the top of the plot, clamped inside the visible plot box on both axes
  // and never over the floating nav. The card's box is a fixed size, so it
  // cannot move under the reader's finger, and the flip only changes once the
  // point has cleared the deadband.
  useLayoutEffect(() => {
    if (!cardPoint || !svgRef.current) {
      flippedRef.current = false;
      setPos((prev) => (prev.ready || prev.left || prev.top
        ? { left: 0, top: 0, ready: false, flipped: false }
        : prev));
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const scrollEl = scrollContainerRef?.current || scrollParentOf(svgRef.current);
    const plot = scrollEl ? scrollEl.getBoundingClientRect() : rect;
    const width = CARD_WIDTH_PX;
    const height = CARD_HEIGHT_PX;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const pointLeft = rect.left + cardPoint.x;
    const pointTop = rect.top + cardPoint.y;

    // Space left above the marker inside the plot once gap and card are placed;
    // negative means the card does not fit above it.
    const slack = pointTop - CARD_GAP - height - (rect.top - MARGIN);
    const flipped = resolveCardFlip(slack, flippedRef.current);
    flippedRef.current = flipped;
    let top = flipped ? pointTop + CARD_GAP : pointTop - CARD_GAP - height;

    // Horizontal clamp against the plot's own box, never beyond the viewport.
    const boundsLeft = Math.max(MARGIN, plot.left + MARGIN);
    const boundsRight = Math.min(vw, plot.right) - MARGIN;
    let left = pointLeft - width / 2;
    left = Math.min(Math.max(left, boundsLeft), Math.max(boundsLeft, boundsRight - width));
    top = Math.max(MARGIN, Math.min(top, vh - NAV_CLEARANCE - height));

    setPos((prev) => (
      prev.ready && prev.left === left && prev.top === top && prev.flipped === flipped
        ? prev
        : { left, top, ready: true, flipped }
    ));
  }, [cardPoint, nowMs, scrollContainerRef]);

  // Dismiss on tap outside, scroll, Escape or resize — but never while a scrub
  // is in flight or in the moment just after it.
  useEffect(() => {
    if (!activePoint) return;
    const holdsCard = () => (
      gestureStateRef.current === "pending"
      || gestureStateRef.current === "scrubbing"
      || Date.now() < dismissSuppressUntilRef.current
    );
    const onDown = (e) => {
      if (e.target?.closest?.("[data-projection-scrub]")) return;
      select(null);
      setCardShown(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") {
        select(null);
        setCardShown(false);
      }
    };
    const onScroll = () => {
      if (!holdsCard()) {
        select(null);
        setCardShown(false);
      }
    };
    const onResize = () => {
      if (!holdsCard()) {
        select(null);
        setCardShown(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [activePoint, select]);

  // The layer only exists when there is something to sit on.
  if (merged.length === 0) return null;

  // The selected entry, carrying the facts its card needs.
  // A past reading is labelled by its own age against server time — never as a
  // forecast, so a clock skew cannot produce a phantom "now" plus "+1m".
  const selected = activePoint
    ? {
        ...activePoint,
        ageSeconds: activePoint.kind === "reading" ? pointAgeSeconds(activePoint, nowMs) : null,
      }
    : null;

  const selectedCopy = projectionCardCopy(selected);

  // A reading is announced as a reading; only a forecast is an estimate.
  const spoken = selectedCopy
    ? `${selected?.kind === "forecast" ? "Projected glucose" : "Glucose"} ${selectedCopy.valueLabel}, ` +
      selectedCopy.eyebrow +
      (selectedCopy.range ? `, ${selectedCopy.range}` : "")
    : "";

  const ariaLabel = spoken
    ? `${spoken}. Use arrow keys to step through the points.`
    : hasFuture
      ? "Projected glucose trajectory. Press Enter to open, then use arrow keys to step through the points."
      : "Glucose readings. Press Enter to open, then use arrow keys to step through the readings.";

  // ── Drawing ───────────────────────────────────────────────────────────
  // Drawn from `dashPoints` — the tail of the scrub's own array — with the SAME
  // shape-preserving smoothing as the measured line (Fritsch–Carlson), so the
  // forecast leaves the tip of the readings' polyline as one continuous curve
  // and cannot overshoot a value the model never produced.
  const linePath = monotoneXPath(dashPoints.map((p) => ({ x: p.x, y: p.y })));

  // The band covers the forecast and closes at the reading, which has no
  // uncertainty of its own: upper edge forward, lower edge back.
  const bandPoints = dashPoints.filter((p) => p.kind === "forecast");
  const hasBand = bandPoints.length > 1 && bandPoints.every((p) => p.lower != null && p.upper != null);
  let bandPath = "";
  if (hasBand) {
    const upper = dashPoints.map((p) => ({ x: p.x, y: getGlucoseY(p.upper != null ? p.upper : p.value) }));
    const lower = dashPoints.map((p) => ({ x: p.x, y: getGlucoseY(p.lower != null ? p.lower : p.value) }));
    const back = monotoneXPath([...lower].reverse()).replace(/^M/, "L");
    bandPath = `${monotoneXPath(upper)} ${back} Z`;
  }

  // The last drawn forecast point carries a small dot, so the eye finds where
  // the estimate stops. No number is attached to it — and it is not drawn at all
  // while a selection exists, because at the horizon the marker would land on top
  // of it and the pair would read as two markers.
  const endPoint = merged[merged.length - 1];

  // Where the dot is drawn. Under the finger while a scrub is running, on the
  // selected entry once a gesture has settled, and on the newest real reading at
  // rest. Nothing else moves it, and it stops at the first reading and the last
  // forecast point.
  const marker = finger
    || (activePoint ? { x: activePoint.x, y: activePoint.y } : null)
    || (restingPoint ? { x: restingPoint.x, y: restingPoint.y } : null);

  // The hit layer's own height: the glucose plot and nothing below it. It can
  // never reach the insulin band, whatever the plot height passed in.
  const hitHeight = Math.max(0, Math.min(plotHeight, glucoseChartHeight - glucoseMarginTop));

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {spoken}
      </div>
      <svg
        ref={svgRef}
        className="absolute top-0 left-0"
        style={{ width: chartWidth, height: glucoseChartHeight, overflow: "visible", outline: "none" }}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {hasBand && <path d={bandPath} fill="#AF751B" fillOpacity={0.1} stroke="none" />}
        <path
          d={linePath}
          stroke="#AF751B"
          strokeWidth={2}
          strokeDasharray="5 5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
        {hasFuture && endPoint && !activePoint && (
          <circle
            cx={endPoint.x}
            cy={endPoint.y}
            r={2.4}
            fill="#AF751B"
            fillOpacity={0.85}
            style={{ pointerEvents: "none" }}
          />
        )}
        {/* The dot: a rust point inside a halo, and nothing else, for a reading
            and for an estimate alike. No drop line, no tick, no connector to the
            axis: a forecast is described in the strip above the chart, a reading
            opens the card on its own. */}
        {marker && (
          <>
            <circle
              cx={marker.x}
              cy={marker.y}
              r={9}
              fill="#8C4A28"
              fillOpacity={scrubbing ? 0.2 : 0.12}
              style={{ pointerEvents: "none" }}
            />
            <circle
              cx={marker.x}
              cy={marker.y}
              r={3.6}
              fill="#8C4A28"
              stroke="#FDF9F2"
              strokeWidth={1.6}
              style={{ pointerEvents: "none" }}
            />
          </>
        )}
        {/* The one scrub layer: a transparent area over the glucose plot only —
            from the top margin down to the BOTTOM OF THE GLUCOSE PLOT, stopping
            above the insulin band, which keeps its own taps and never starts a
            scrub. It is the only set of pointer handlers in this file. Everything
            above it in this svg is inert (pointerEvents: none), so the dashed
            line cannot compete for touches. touch-action is none, because
            horizontal movement here belongs to the scrub and not to the
            scroller; a gesture whose first movement is clearly vertical is
            handed to the page by hand. */}
        <rect
          ref={hitRef}
          data-projection-scrub
          x={0}
          y={glucoseMarginTop}
          width={chartWidth}
          height={hitHeight}
          fill="transparent"
          style={{ cursor: "pointer", touchAction: "none", pointerEvents: "all" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      </svg>

      {/* The cream card exists only for a tapped reading. An estimate is
          described by the strip, so no portal node is created and nothing is
          measured. */}
      {cardPoint && createPortal(
        <AnimatePresence>
          {/* Opacity only: a vertical entrance would animate every time the card
              flipped between a reading and a forecast point. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: pos.ready ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="fixed z-[300] pointer-events-none"
            style={{ left: pos.left, top: pos.top }}
          >
            <ProjectionTooltipCard point={selected} />
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}