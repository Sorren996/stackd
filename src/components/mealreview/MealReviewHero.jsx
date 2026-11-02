import { MR, CAPS, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * Hero for the expanded Meal Review. Sits directly on the slate ground:
 * eyebrow, one editorial headline with a single italic word, one sentence
 * built from values the card already shows, then three light numerals.
 *
 * Every string is passed in by MealReviewAtAGlance; nothing is derived here.
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

function Numeral({ label, value, unit, divider }) {
  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      {divider && (
        <span aria-hidden="true" className="mr-3 w-px shrink-0 self-stretch" style={{ background: MR.onGroundHairline }} />
      )}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          <span
            className="tabular-nums"
            style={{ fontSize: 30, fontWeight: 300, lineHeight: 1, letterSpacing: "-0.02em", color: MR.onGround }}
          >
            {value}
          </span>
          {unit && (
            <span style={{ fontSize: 10, fontWeight: 600, color: MR.onGroundMuted }}>{unit}</span>
          )}
        </div>
        <div className="mt-2" style={{ ...CAPS, fontSize: 10, color: MR.onGroundMuted }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export default function MealReviewHero({ eyebrow, headline, headlineItalic, sentence, numerals, unit }) {
  return (
    <div className="px-1">
      {eyebrow && (
        <div style={{ ...CAPS, fontSize: 11, color: MR.onGroundMuted }}>{eyebrow}</div>
      )}

      <h2
        className="mt-3"
        style={{
          fontSize: 48,
          fontWeight: 600,
          lineHeight: 1.04,
          letterSpacing: "-0.025em",
          color: MR.onGround,
        }}
      >
        <Headline text={headline} italic={headlineItalic} />
      </h2>

      {sentence && (
        <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.5, color: MR.onGroundMuted }}>
          {sentence}
        </p>
      )}

      <div className="mt-5 flex items-stretch" style={{ borderTop: `1px solid ${MR.onGroundHairline}`, paddingTop: 16 }}>
        {numerals.map((numeral, index) => (
          <Numeral
            key={numeral.label}
            label={numeral.label}
            value={numeral.value}
            unit={index === numerals.length - 1 ? unit : null}
            divider={index > 0}
          />
        ))}
      </div>
    </div>
  );
}