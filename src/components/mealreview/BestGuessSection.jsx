import AbsorptionProgressCurve from "@/components/rightnow/AbsorptionProgressCurve";
import MealCollapsibleRow from "@/components/rightnow/MealCollapsibleRow";
import LedgerLine from "./LedgerLine";
import { MR, SERIF_ITALIC, SECTION_HEAD } from "./mealReviewTheme";

/**
 * Card 2, section B — "Our best guess".
 *
 * Modeled absorption, clearly framed as a guess. The two headline figures sit
 * as ledger lines instead of a progress bar; the exact modeled numbers
 * (percent processed, g/hour, the peak-timing difference in minutes, the
 * learned-timing caption and the absorption curve itself) stay inside the
 * disclosure, so nothing is lost.
 */
export default function BestGuessSection({
  tooEarly,
  absorbed,
  total,
  comparison,
  aside,
  details,
  curve,
}) {
  const toCome = Math.max(0, Math.round(total) - Math.round(absorbed));

  return (
    <section>
      <div style={SECTION_HEAD}>Our best guess</div>

      {tooEarly ? (
        <p className="mt-2" style={{ ...SERIF_ITALIC, fontSize: 13, color: MR.sec }}>
          Too early to read absorption.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            <LedgerLine label="Absorbed so far" value={`${absorbed} g`} tone={MR.ink} />
            <LedgerLine label="Still to come" value={`${toCome} g`} />
          </div>

          {comparison && (
            <p className="mt-3" style={{ ...SERIF_ITALIC, fontSize: 13, lineHeight: 1.55, color: MR.ink }}>
              {comparison}
            </p>
          )}

          {aside && (
            <p className="mt-1" style={{ fontSize: 11.5, lineHeight: 1.6, color: MR.sec }}>
              {aside}
            </p>
          )}

          <div className="mt-1">
            <MealCollapsibleRow label={<span style={{ ...SERIF_ITALIC, fontSize: 13, color: MR.sec }}>See how we guessed</span>}>
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