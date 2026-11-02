import AbsorptionProgressCurve from "@/components/rightnow/AbsorptionProgressCurve";
import MealCollapsibleRow from "@/components/rightnow/MealCollapsibleRow";
import { MR, CAPS, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * Card 2, section B — "Our best guess".
 *
 * Modeled absorption, clearly framed as a guess. The headline figures are the
 * same values the card already computed; the exact modeled numbers (percent
 * processed, g/hour, the peak-timing difference in minutes, the learned-timing
 * caption and the absorption curve itself) live inside the disclosure so
 * nothing is lost.
 */
export default function BestGuessSection({
  tooEarly,
  absorbed,
  total,
  progress,
  comparison,
  aside,
  details,
  curve,
}) {
  return (
    <section>
      <div style={{ ...CAPS, color: MR.sec }}>Our best guess</div>

      {tooEarly ? (
        <p className="mt-3" style={{ fontSize: 13, color: MR.sec }}>Too early to read absorption.</p>
      ) : (
        <>
          <div className="mt-3">
            <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 300, color: MR.ink }}>
              {absorbed} of {total} g absorbed
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: MR.band }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: MR.tan }}
              />
            </div>
          </div>

          {comparison && (
            <p className="mt-3" style={{ ...SERIF_ITALIC, fontSize: 13, lineHeight: 1.55, color: MR.ink }}>
              {comparison}
            </p>
          )}

          {aside && (
            <p className="mt-1.5" style={{ ...SERIF_ITALIC, fontSize: 12, lineHeight: 1.5, color: MR.sec }}>
              {aside}
            </p>
          )}

          <div className="mt-2">
            <MealCollapsibleRow label="See how we guessed">
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