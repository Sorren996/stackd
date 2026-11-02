import MealCollapsibleRow from "@/components/rightnow/MealCollapsibleRow";
import { MR, CAPS } from "./mealReviewTheme";

/**
 * Card 2, section C — "Still working".
 *
 * The active-insulin figure and the existing breakdown behind it. Same
 * content and controls as before; the row is just one clear tap target with a
 * chevron.
 */
export default function StillWorkingSection({ iob, children }) {
  return (
    <MealCollapsibleRow
      labelClassName=""
      label={<span style={{ ...CAPS, color: MR.sec }}>Still working</span>}
      preview={
        <span className="tabular-nums" style={{ fontSize: 20, fontWeight: 300, lineHeight: 1, color: MR.ink }}>
          {iob}u
        </span>
      }
    >
      {children}
    </MealCollapsibleRow>
  );
}