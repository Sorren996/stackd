import MealReviewCard from "./MealReviewCard";
import GlucoseResponseChart from "./GlucoseResponseChart";
import { MR, CAPS, SERIF_ITALIC } from "./mealReviewTheme";

function Stat({ value, label, aside }) {
  return (
    <div className="min-w-0 flex-1 py-4">
      <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 300, lineHeight: 1, color: MR.ink }}>
        {value}
      </div>
      <div className="mt-2" style={{ ...CAPS, fontSize: 10, color: MR.sec }}>
        {label}
        {aside && (
          <>
            {" "}
            <span style={{ ...SERIF_ITALIC, letterSpacing: 0, textTransform: "none", color: MR.sec }}>
              {aside}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Card 1 — "How it went". Edge-to-edge glucose chart and the two measured
 * window stats. Both stats keep their existing visibility rule: they render
 * only when the window has readings to measure.
 */
export default function HowItWentCard({
  chartProps,
  showStats,
  inRangePct,
  returnLabel,
  returnValue,
  returnAside,
}) {
  return (
    <MealReviewCard>
      <div className="px-6 pt-6">
        <div style={{ ...CAPS, color: MR.sec }}>How it went</div>
      </div>

      <div className="pt-2">
        <GlucoseResponseChart {...chartProps} />
      </div>

      {showStats && (
        <div
          className="mx-6 flex items-stretch border-t"
          style={{ borderColor: MR.hairline }}
        >
          <Stat value={`${inRangePct}%`} label="In range" aside="since you ate" />
          <span aria-hidden="true" className="w-px shrink-0 self-stretch" style={{ background: MR.hairline }} />
          <div className="min-w-0 flex-1 pl-5">
            <Stat value={returnValue} label={returnLabel} aside={returnAside} />
          </div>
        </div>
      )}
    </MealReviewCard>
  );
}