import MealReviewCard from "./MealReviewCard";
import GlucoseResponseChart from "./GlucoseResponseChart";
import { MR, SECTION_HEAD } from "./mealReviewTheme";

/**
 * Card 1 — "How it went". Edge-to-edge glucose chart, then the two measured
 * window stats set as one running sentence rather than two equal columns
 * divided by a rule. Both stats keep their existing visibility rule: they
 * render only when the window has readings to measure.
 */
export default function HowItWentCard({
  chartProps,
  showStats,
  inRangePct,
  returnLabel,
  returnValue,
  returnAside,
}) {
  const recovery = returnAside
    ? `${returnValue} back in range, ${returnAside}`
    : returnValue && returnValue !== "-"
      ? `${returnLabel.toLowerCase()} after ${returnValue}`
      : null;

  return (
    <MealReviewCard>
      <div className="px-5 pt-5">
        <div style={SECTION_HEAD}>How it went</div>
      </div>

      <div className="pt-1">
        <GlucoseResponseChart {...chartProps} />
      </div>

      {showStats && (
        <p
          className="px-5 pb-5 pt-1"
          style={{ fontSize: 12.5, lineHeight: 1.65, color: MR.sec }}
        >
          <span className="tabular-nums" style={{ fontWeight: 600, color: MR.ink }}>
            {inRangePct}%
          </span>{" "}
          in range since you ate
          {recovery && (
            <>
              <span style={{ color: MR.tan }}> · </span>
              {recovery}
            </>
          )}
        </p>
      )}

      {!showStats && <div style={{ height: 14 }} />}
    </MealReviewCard>
  );
}