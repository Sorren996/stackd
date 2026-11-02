import MealReviewCard from "./MealReviewCard";
import DoseAndPlanSection from "./DoseAndPlanSection";
import BestGuessSection from "./BestGuessSection";
import StillWorkingSection from "./StillWorkingSection";
import WhatYouAteSection from "./WhatYouAteSection";
import { MR } from "./mealReviewTheme";

/**
 * Card 2 — the dose statement, the modeled guess and the insulin still working,
 * then the footer with what was eaten and the plan line. Sections are separated
 * by space and a short hairline rule rather than a heading over every block.
 */
export default function DosePlanCard({ dosePlan, bestGuess, stillWorking, footer }) {
  return (
    <MealReviewCard>
      <div className="px-5 pt-5">
        {dosePlan && <DoseAndPlanSection {...dosePlan} />}

        <div
          className={dosePlan ? "mt-5 border-t pt-4" : ""}
          style={dosePlan ? { borderColor: MR.hairline } : undefined}
        >
          <BestGuessSection {...bestGuess} />
        </div>

        <div className="mt-3">
          <StillWorkingSection iob={stillWorking.iob}>{stillWorking.children}</StillWorkingSection>
        </div>
      </div>

      <div className="mx-5 mt-3 border-t" style={{ borderColor: MR.hairline }} />
      <WhatYouAteSection {...footer} />
    </MealReviewCard>
  );
}