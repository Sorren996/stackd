// The projection tooltip, as an editorial card.
//
// Three lines, no shadow, no scrim: an eyebrow that says WHEN, a large tabular
// number that says WHAT, and a quiet line that says HOW SURE. The interaction
// around it (swipe, arrows, VoiceOver) lives in ProjectionOverlay — this file
// only draws the card.
//
// Copy rules, enforced here so no caller can drift from them:
//   • a forecast point reads "estimated in N min" — never "Est.", never "+1m";
//   • a real reading reads its own age in words ("21 min ago", "now"), with the
//     value and nothing else — no range, no estimate language;
//   • the range line reads "likely between X and Y" — never "High ~" / "Low ~",
//     and never a tilde.

// The card's box is fixed, never content-sized. A reading card ("21 min ago",
// value) and a forecast card ("estimated in 20 min", value, a two-line range)
// are different shapes, and a card that resized between them would move its own
// clamp and flip under the reader's finger. Width and the three reserved lines
// below are therefore constants the overlay positions against. The card is at
// least 158px wide by design; it is drawn at the clamp width so its box cannot
// change under the finger.
export const CARD_MIN_WIDTH_PX = 158;
export const CARD_WIDTH_PX = 190;
// 2px border + 23px padding + 12px eyebrow + 4px gap + 40px value + 5px gap
// + 34px reserved for the range line (two lines at 12.5px / 1.35).
export const CARD_HEIGHT_PX = 120;
const VALUE_BLOCK_PX = 40;
const RANGE_BLOCK_PX = 34;

function eyebrowFor(point) {
  if (point.kind === "forecast") return `estimated in ${Math.max(1, Math.round(point.minOffset))} min`;
  if (point.ageSeconds != null && point.ageSeconds < 90) return "now";
  if (point.ageSeconds == null) return "now";
  const minutes = Math.max(1, Math.round(point.ageSeconds / 60));
  return `${minutes} min ago`;
}

// A forecast point carries the range it was drawn with. A real reading carries
// nothing but its own value and age — it is a measurement, not an estimate.
function rangeFor(point) {
  if (point.kind !== "forecast") return null;
  if (point.lower != null && point.upper != null) {
    return `likely between ${point.lower} and ${point.upper}`;
  }
  return null;
}

/** Every string this card will show, used by the aria-live announcements. */
export function projectionCardCopy(point) {
  if (!point) return null;
  return {
    eyebrow: eyebrowFor(point),
    value: String(Math.round(point.value)),
    range: rangeFor(point),
  };
}

export default function ProjectionTooltipCard({ point }) {
  const copy = projectionCardCopy(point);
  if (!copy) return null;

  return (
    <div
      style={{
        boxSizing: "border-box",
        display: "block",
        width: CARD_WIDTH_PX,
        minWidth: CARD_MIN_WIDTH_PX,
        background: "#FDF9F2",
        border: "1px solid rgba(46,36,32,.14)",
        borderRadius: 14,
        padding: "11px 14px 12px",
        boxShadow: "none",
        textAlign: "left",
      }}
    >
      <div
        style={{
          height: 12,
          fontSize: 10,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "#8F7E6B",
          whiteSpace: "nowrap",
          overflow: "hidden",
          lineHeight: "12px",
        }}
      >
        {copy.eyebrow}
      </div>
      <div
        style={{
          minHeight: VALUE_BLOCK_PX,
          fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
          fontSize: 42,
          lineHeight: 0.94,
          fontWeight: 400,
          color: "#8C4A28",
          fontVariantNumeric: "tabular-nums",
          marginTop: 4,
          letterSpacing: "-0.01em",
        }}
      >
        {copy.value}
      </div>
      {/* Always rendered, so a reading card and a two-line forecast card are
          exactly the same height. */}
      <div
        style={{
          minHeight: RANGE_BLOCK_PX,
          maxHeight: RANGE_BLOCK_PX,
          overflow: "hidden",
          fontSize: 12.5,
          lineHeight: 1.35,
          color: "#5B5046",
          marginTop: 5,
        }}
      >
        {copy.range}
      </div>
    </div>
  );
}