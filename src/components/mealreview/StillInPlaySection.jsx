import AbsorptionProgressCurve from "@/components/rightnow/AbsorptionProgressCurve";
import MealCollapsibleRow from "@/components/rightnow/MealCollapsibleRow";
import { MR, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * "Still in play" — the modeled absorption for the meal in scope.
 *
 * The sentence, the tan bar and the gram figure are the same modeled numbers
 * the card already produced; the exact modeled detail (percent processed, the
 * g/hour rate, the peak-timing comparison in minutes, the learned-timing
 * caption and the absorption curve itself) stays behind the disclosure so
 * nothing is lost. Everything here is an estimate from the logged meal, which
 * the card's subline says plainly.
 */
export default function StillInPlaySection({
  mealName,
  tooEarly,
  absorbed,
  total,
  progress,
  comparison,
  aside,
  details,
  curve,
}) {
  const toCome = Math.max(0, Math.round(total) - Math.round(absorbed));
  const pct = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));

  return (
    <section>
      {tooEarly ? (
        <p style={{ ...SERIF_ITALIC, fontSize: 13.5, lineHeight: 1.55, color: MR.sec }}>
          Too early to read absorption.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: MR.ink }}>
            {toCome > 0 ? (
              <>
                About{" "}
                <span className="tabular-nums" style={{ fontWeight: 600 }}>
                  {toCome} g
                </span>{" "}
                of carbs from {mealName} are still absorbing.
              </>
            ) : (
              <>The carbs from {mealName} look fully absorbed.</>
            )}
          </p>

          <div
            className="mt-3 overflow-hidden"
            style={{ height: 6, borderRadius: 999, background: MR.track }}
            aria-hidden="true"
          >
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: MR.tan }} />
          </div>

          <p className="mt-1.5 text-right tabular-nums" style={{ fontSize: 11, color: MR.sec }}>
            {absorbed} of {total} g absorbed
          </p>

          {comparison && (
            <p className="mt-2" style={{ ...SERIF_ITALIC, fontSize: 13, lineHeight: 1.55, color: MR.ink }}>
              {comparison}
            </p>
          )}

          {aside && (
            <p className="mt-1.5" style={{ fontSize: 11.5, lineHeight: 1.6, color: MR.sec }}>
              {aside}
            </p>
          )}

          <div className="mt-1">
            <MealCollapsibleRow
              label={<span style={{ ...SERIF_ITALIC, fontSize: 13, color: MR.sec }}>See how we guessed</span>}
            >
              <div className="space-y-1.5">
                <p className="tabular-nums" style={{ fontSize: 12, color: MR.sec }}>
                  {details.pct}% processed, {details.gPerHour} g/hour
                </p>
                <AbsorptionProgressCurve
                  entries={curve.entries}
                  mealTime={curve.mealTime}
                  now={curve.now}
                  peakTime={curve.peakTime}
                  opts={curve.opts}
                />
                {details.reconciliation && (
                  <p style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>{details.reconciliation}</p>
                )}
                {details.scopedStats && (
                  <p className="tabular-nums" style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>
                    {details.scopedStats}
                  </p>
                )}
                {details.scopedNumbers && (
                  <p className="tabular-nums" style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>
                    {details.scopedNumbers}
                  </p>
                )}
                {details.windowLeftLabel && (
                  <p className="tabular-nums" style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>
                    {details.windowLeftLabel}
                  </p>
                )}
                {details.learnedTiming && details.timingCaption && (
                  <p style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>
                    {details.timingCaption} Your future estimates include this.
                  </p>
                )}
              </div>
            </MealCollapsibleRow>
          </div>
        </>
      )}
    </section>
  );
}