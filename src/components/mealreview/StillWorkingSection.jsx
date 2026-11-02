import MealCollapsibleRow from "@/components/rightnow/MealCollapsibleRow";
import { MR, SERIF } from "./mealReviewTheme";

/**
 * Card 2, section C — "Still working".
 *
 * The active-insulin figure and the existing breakdown behind it. Same
 * content and controls as before; the row is one clear tap target with a
 * chevron, and the figure is set as a plain tabular value rather than a
 * headline number.
 */
export default function StillWorkingSection({ iob, children }) {
  return (
    <MealCollapsibleRow
      labelClassName=""
      label={<span style={{ ...SERIF, fontSize: 15, color: MR.ink }}>Still working</span>}
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