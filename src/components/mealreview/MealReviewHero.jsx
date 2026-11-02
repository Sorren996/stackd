import { MR, CAPS, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * Hero for the expanded Meal Review. Sits directly on the slate ground with no
 * surface of its own: a context eyebrow, one editorial headline with a single
 * italic serif phrase, one factual sentence, then the current measured reading
 * as a compact line. The reading stays a line, never a second hero.
 *
 * Every string and value is passed in by the parent; nothing is derived here.
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
    <div className="px-1">
      {eyebrow && (
        <div style={{ ...CAPS, fontSize: 10, letterSpacing: "0.18em", color: MR.onGroundMuted }}>
          {eyebrow}
        </div>
      )}

      <h2
        className="mt-2.5"
        style={{
          fontSize: 33,
          fontWeight: 500,
          lineHeight: 1.14,
          letterSpacing: "-0.02em",
          color: MR.onGround,
        }}
      >
        <Headline text={headline} italic={headlineItalic} />
      </h2>

      {sentence && (
        <p className="mt-3" style={{ fontSize: 14.5, lineHeight: 1.55, color: MR.onGroundMuted }}>
          {sentence}
        </p>
      )}

      {reading && (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5" style={{ fontSize: 13, color: MR.onGroundMuted }}>
          <span
            className="tabular-nums"
            style={{ fontSize: 15, fontWeight: 600, color: MR.onGround }}
          >
            {reading.value} {reading.unit}
          </span>
          {reading.trend && <span>· {reading.trend}</span>}
          {reading.freshness && <span>· {reading.freshness}</span>}
        </p>
      )}
    </div>
  );
}