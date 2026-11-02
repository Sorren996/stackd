import { MR, CAPS, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * Hero for the expanded Meal Review. It sits directly on the slate ground with
 * no surface, wash or highlight of its own — the `stackd-on-field` class keeps
 * the page's paper-grain layer from painting behind text that merely carries a
 * cream colour value.
 *
 * The heading is a modest, natural line rather than a display statement; the
 * sentence is optional and only passed when the data supports it. Every string
 * and value is passed in by the parent.
 */

function Headline({ text, italic }) {
  if (!text) return null;
  const index = italic ? text.indexOf(italic) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <em style={SERIF_ITALIC}>{italic}</em>
      {text.slice(index + italic.length)}
    </>
  );
}

export default function MealReviewHero({ eyebrow, headline, headlineItalic, sentence, reading }) {
  return (
    <div className="stackd-on-field px-1">
      {eyebrow && (
        <div style={{ ...CAPS, fontSize: 10, letterSpacing: "0.18em", color: MR.onGroundMuted }}>
          {eyebrow}
        </div>
      )}

      <h2
        className="mt-2"
        style={{
          fontSize: 25,
          fontWeight: 500,
          lineHeight: 1.24,
          letterSpacing: "-0.01em",
          color: MR.onGround,
        }}
      >
        <Headline text={headline} italic={headlineItalic} />
      </h2>

      {sentence && (
        <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.55, color: MR.onGroundMuted }}>
          {sentence}
        </p>
      )}

      {reading && (
        <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5" style={{ fontSize: 13, color: MR.onGroundMuted }}>
          <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: MR.onGround }}>
            {reading.value} {reading.unit}
          </span>
          {reading.trend && <span>· {reading.trend}</span>}
          {reading.freshness && <span>· {reading.freshness}</span>}
        </p>
      )}
    </div>
  );
}