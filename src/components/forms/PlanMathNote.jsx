import { getPlanMath, readMealUnitsPer5g } from "@/lib/planMath";
import { FieldLabel, INK, TAUPE, FAINT, CANVAS } from "@/components/forms/FieldKit";

/**
 * Meal log form — "Your plan's math". Translates logged carbs into the units
 * the user's own I:C setting describes. No apply button, no pre-filled dose.
 * The disclaimer line is always present.
 */
export default function PlanMathNote({ carbs }) {
  const per5g = readMealUnitsPer5g();
  const math = getPlanMath(carbs, per5g);

  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: CANVAS }}>
      <FieldLabel>Your plan's math</FieldLabel>
      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: math ? INK : TAUPE }}>
        {math ? (
          <>
            Your settings translate <span className="font-semibold tabular-nums">{math.carbs}g</span> to about{" "}
            <span className="font-semibold tabular-nums">{math.units.toFixed(1)}u</span> (I:C 1:{math.gramsPerUnit.toFixed(1)}).
          </>
        ) : per5g ? (
          "Add carbs to see how your settings translate this meal."
        ) : (
          "Add your insulin-to-carb ratio in Settings to see your plan's math here."
        )}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: FAINT }}>
        Describes your plan's math. Not a dose recommendation.
      </p>
    </div>
  );
}