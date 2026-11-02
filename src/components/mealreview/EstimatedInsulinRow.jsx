import MealCollapsibleRow from "@/components/rightnow/MealCollapsibleRow";
import { MR } from "./mealReviewTheme";

/**
 * The active-insulin figure with its existing breakdown behind the chevron.
 *
 * Scope is stated plainly: the value is the active bolus insulin across the
 * doses that already appear in the breakdown, so it is never read as a
 * per-meal total or as a sum of separate dose groups.
 */
export default function EstimatedInsulinRow({ iob, children }) {
  return (
    <MealCollapsibleRow
      labelClassName=""
      label={
        <span>
          <span className="block" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: MR.ink }}>
            Estimated active insulin
          </span>
          <span className="mt-0.5 block" style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>
            Across the bolus doses listed inside
          </span>
        </span>
      }
      preview={
        <span className="tabular-nums" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, color: MR.rust }}>
          {iob}u
        </span>
      }
    >
      {children}
    </MealCollapsibleRow>
  );
}