import { MR, CAPS, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * Card 2, section A — "Your dose and your plan".
 *
 * Two horizontal bars drawn from the values the card already computes (the
 * person's own plan math and what they logged). The bars are scaled relative
 * to each other for reading only; no value is recalculated here.
 */

function BarRow({ label, value, max, color }) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 13, color: MR.sec }}>{label}</span>
        <span className="tabular-nums" style={{ fontSize: 14, fontWeight: 600, color: MR.ink }}>
          {value.toFixed(1)}u
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full" style={{ background: MR.band }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}

function planCaption({ carbs, ratioLabel, correctionUnits, correctionAvailable, correctionInRange }) {
  const food = `Food, ${carbs} g at ${ratioLabel}`;
  if (!correctionAvailable) {
    return `${food}. Correction, no reading at dose time. This just shows your plan's math. The dose is always yours.`;
  }
  if (correctionUnits > 0.01) {
    return `${food}, plus ${correctionUnits.toFixed(1)}u correction. This just shows your plan's math. The dose is always yours.`;
  }
  return `${food}, plus 0u correction, ${
    correctionInRange ? "in range" : "out of range"
  } at dose time. This just shows your plan's math. The dose is always yours.`;
}

export default function DoseAndPlanSection({
  show,
  neutralLabel,
  planned,
  taken,
  foodUnits,
  correctionValue,
  correctionLabel,
  correctionUnits,
  correctionAvailable,
  correctionInRange,
  carbs,
  ratioLabel,
  difference,
  absDiff,
}) {
  const pill =
    absDiff < 0.05
      ? { text: "Matches your plan", tone: "calm" }
      : difference > 0
        ? { text: `${absDiff.toFixed(1)}u more than plan`, tone: "over" }
        : { text: `${absDiff.toFixed(1)}u less than plan`, tone: "calm" };

  const pillStyle =
    pill.tone === "over"
      ? { background: "rgba(160,82,45,0.12)", color: MR.rust, border: `1px solid rgba(160,82,45,0.24)` }
      : { background: "rgba(107,125,85,0.12)", color: "#4D5742", border: "1px solid rgba(107,125,85,0.24)" };

  return (
    <section>
      <div style={{ ...CAPS, color: MR.sec }}>Your dose and your plan</div>

      {!show ? (
        <p className="mt-3" style={{ fontSize: 13, lineHeight: 1.5, color: MR.sec }}>
          {neutralLabel}
        </p>
      ) : (
        <>
          <div className="mt-4">
            <BarRow
              label="Your plan's math"
              value={planned}
              max={Math.max(planned, taken, 0.1)}
              color={MR.tan}
            />
            <BarRow label="You took" value={taken} max={Math.max(planned, taken, 0.1)} color={MR.rust} />
          </div>

          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="tabular-nums" style={{ fontSize: 11, color: MR.sec }}>
              Food {foodUnits.toFixed(1)}u · Correction {correctionValue}
            </span>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 tabular-nums"
              style={{ ...pillStyle, fontSize: 10, fontWeight: 600 }}
            >
              {pill.text}
            </span>
          </div>

          {correctionLabel && (
            <p className="mt-1" style={{ fontSize: 11, color: MR.sec }}>{correctionLabel}</p>
          )}

          <p className="mt-3" style={{ ...SERIF_ITALIC, fontSize: 13, lineHeight: 1.55, color: MR.sec }}>
            {planCaption({ carbs, ratioLabel, correctionUnits, correctionAvailable, correctionInRange })}
          </p>
        </>
      )}
    </section>
  );
}