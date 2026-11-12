// The projection tooltip, as an editorial card.
//
// Three lines, no shadow, no scrim: an eyebrow that says WHEN, a large tabular
// number that says WHAT, and a quiet line that says HOW SURE. The interaction
// around it (swipe, arrows, VoiceOver) lives in ProjectionOverlay — this file
// only draws the card.
//
// Copy rules, enforced here so no caller can drift from them:
//   • a forecast point reads "estimated in N min" — never "Est.", never "+1m";
//   • a real reading reads "now" or "N min ago" — never a forecast label;
//   • the range line reads "likely between X and Y" — never "High ~" / "Low ~",
//     and never a tilde.

export const CARD_MAX_WIDTH_PX = 220;

function eyebrowFor(point) {
  if (point.kind === "forecast") return `estimated in ${Math.max(1, Math.round(point.minOffset))} min`;
  if (point.ageSeconds != null && point.ageSeconds < 90) return "now";
  if (point.ageSeconds == null) return "now";
  const minutes = Math.max(1, Math.round(point.ageSeconds / 60));
  return `${minutes} min ago`;
}

function rangeFor(point) {
  if (point.kind === "forecast") {
    if (point.lower != null && point.upper != null) {
      return `likely between ${point.lower} and ${point.upper}`;
    }
    return null;
  }
  return point.trendWord || null;
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
        display: "inline-block",
        width: "fit-content",
        maxWidth: CARD_MAX_WIDTH_PX,
        background: "#FDF9F2",
        border: "1px solid rgba(46,36,32,.14)",
        borderRadius: 14,
        padding: "11px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "#8F7E6B",
          whiteSpace: "nowrap",
          lineHeight: 1.2,
        }}
      >
        {copy.eyebrow}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
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
      {copy.range && (
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.35,
            color: "#5B5046",
            marginTop: 5,
          }}
        >
          {copy.range}
        </div>
      )}
    </div>
  );
}