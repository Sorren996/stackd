import MealReviewCard from "./MealReviewCard";
import MealWindowChart from "./MealWindowChart";
import { MR, SERIF, SERIF_ITALIC, splitItalic } from "./mealReviewTheme";

/**
 * The one shared card: the measured timeline for the window being reviewed,
 * the window's own figures as quiet labelled lines, then every represented meal
 * as an expandable row (passed in as children, so each meal's detail opens
 * inside this card rather than in a second one).
 *
 * The figures only ever describe the window they sit under — with more than one
 * meal they are labelled as the window's, never as one meal's.
 */

function Heading({ text, accent }) {
  const { before, phrase, after } = splitItalic(text, accent);
  return (
    <h3 style={{ ...SERIF, fontSize: 17, lineHeight: 1.3, color: MR.ink }}>
      {before}
      {phrase ? <em style={SERIF_ITALIC}>{phrase}</em> : null}
      {after}
    </h3>
  );
}

export default function TimelineCard({ title, titleAccent, chartProps, stats = [], note, children }) {
  return (
    <MealReviewCard>
      <div className="px-5 pt-5">
        <Heading text={title} accent={titleAccent} />
      </div>

      <div className="pt-2">
        <MealWindowChart {...chartProps} />
      </div>

      {(stats.length > 0 || note) && (
        <div className="px-5 pt-2.5">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={index === 0 ? "flex items-baseline justify-between gap-3 py-1.5" : "flex items-baseline justify-between gap-3 border-t py-1.5"}
              style={index === 0 ? undefined : { borderColor: MR.hairline }}
            >
              <span style={{ fontSize: 12, color: MR.sec }}>{stat.label}</span>
              <span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 500, color: MR.ink }}>
                {stat.value}
              </span>
            </div>
          ))}

          {note && (
            <p className="pt-1.5" style={{ fontSize: 11.5, lineHeight: 1.6, color: MR.sec }}>
              {note}
            </p>
          )}
        </div>
      )}

      {children && (
        <div className="mt-3 border-t" style={{ borderColor: MR.hairline }}>
          {children}
        </div>
      )}

      <div style={{ height: 14 }} />
    </MealReviewCard>
  );
}