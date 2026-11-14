import MealCollapsibleRow from "@/components/rightnow/MealCollapsibleRow";
import StillInPlaySection from "./StillInPlaySection";
import EstimatedInsulinRow from "./EstimatedInsulinRow";
import DoseAndPlanSection from "./DoseAndPlanSection";
import WhatYouAteSection from "./WhatYouAteSection";
import { MR, SERIF, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * Card 2 — the estimates for the meal in scope, then the two disclosures that
 * hold every existing detail, then what was eaten.
 *
 * The heading is the section's promise ("Still in play"), the subline says
 * where the numbers come from, and every modeled figure stays inside a
 * disclosure so an estimate is never read as a measurement.
 */
export default function DosePlanCard({ stillInPlay, insulin, dose, footer, actions }) {
  return (
    <div>
      <div className="px-5 pt-5">
        <h3 style={{ ...SERIF, fontSize: 17, lineHeight: 1.3, color: MR.ink }}>
          Still in <em style={SERIF_ITALIC}>play</em>
        </h3>
        <p className="mt-1.5" style={{ fontSize: 12, lineHeight: 1.55, color: MR.sec }}>
          Estimates from your meal and insulin logs.
        </p>

        <div className="mt-4">
          <StillInPlaySection {...stillInPlay} />
        </div>
      </div>

      <div className="px-5 pb-1">
        <EstimatedInsulinRow iob={insulin.iob}>{insulin.children}</EstimatedInsulinRow>

        {dose && (
          <MealCollapsibleRow
            labelClassName=""
            label={
              <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: MR.ink }}>
                Your dose and your plan
              </span>
            }
            preview={
              <span className="tabular-nums" style={{ fontSize: 12.5, lineHeight: 1.4, color: MR.sec }}>
                {dose.taken > 0 ? `${dose.taken.toFixed(1)}u logged` : "No dose logged"}
              </span>
            }
          >
            <DoseAndPlanSection {...dose} />
          </MealCollapsibleRow>
        )}
      </div>

      <div className="mx-5 mt-1 border-t" style={{ borderColor: MR.hairline }} />
      <WhatYouAteSection {...footer} />
      {actions}
    </div>
  );
}