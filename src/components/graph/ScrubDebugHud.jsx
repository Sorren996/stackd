// TEMPORARY — scrub instrumentation.
//
// A fixed, monospace, 10px readout of the live scrub mapping, shown only while
// a scrub is running. It exists to answer one question with numbers instead of
// guesses: does the drawn marker's x follow the finger's content x, or does it
// stop somewhere while contentX keeps moving?
//
// Nothing here is part of the product: it is rendered through a portal so no
// scrolling or transformed ancestor can move it, and it takes no pointer events.

import { createPortal } from "react-dom";

const FIELDS = [
  ["clientX", "clientX"],
  ["contentX", "contentX"],
  ["time", "time"],
  ["chartWidth r", "r"],
  ["nearestIndex", "nearestIndex"],
  ["nearestKind", "nearestKind"],
  ["nearestX", "nearestX"],
  ["markerX", "markerX"],
  ["points count", "points"],
  ["forecast count", "forecasts"],
];

// The domain check (item 4): the furthest forecast x against the drawn width r,
// plus the scroll offset the mapping is resolved against — the pinned offset is
// the reason a finger can only reach so far right.
const GEOMETRY_FIELDS = [
  ["maxForecastX", "maxForecastX"],
  ["rectW", "rectW"],
  ["scrollLeft", "scrollLeft"],
];

export default function ScrubDebugHud({ debug }) {
  if (!debug) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 6,
        left: 6,
        zIndex: 400,
        pointerEvents: "none",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        lineHeight: 1.5,
        color: "#3f3830",
        background: "rgba(253, 249, 242, 0.95)",
        border: "1px solid #d8cec2",
        borderRadius: 6,
        padding: "4px 6px",
        maxWidth: "calc(100vw - 12px)",
        whiteSpace: "normal",
        wordBreak: "break-word",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 6 }}>
        {FIELDS.map(([label, key]) => (
          <span key={key}>
            {label} <b>{debug[key] ?? "—"}</b>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 6, marginTop: 2 }}>
        {GEOMETRY_FIELDS.map(([label, key]) => (
          <span key={key}>
            {label} <b>{debug[key] ?? "—"}</b>
          </span>
        ))}
        <span>
          fits <b>{debug.fits ? "yes" : "NO"}</b>
        </span>
      </div>
    </div>,
    document.body
  );
}